'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GitCompare,
  History,
  Lock,
  Plus,
  RotateCcw,
  Split,
  Trash2,
  Unlock,
  Wallet,
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
  type CanonicalBrandCode,
  getScenariosForBrand,
  normalizePortfolioBrandCode,
} from '@/lib/unifiedBusinessEngine';
import {
  type CapitalInjectionRecord,
  type ChronologicalCashEvent,
  type ComputedInvestmentScheduleResult,
  type CustomCashOperationRecord,
  type OperationPaymentStatus,
  type PaymentTrancheSpec,
  type SystemActionRecommendation,
  type WhenAndHowMuchFactoryPaymentItem,
  addDaysToIsoDate,
  formatIsoDateDotRu,
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

function fmtSignedDeltaMln(valRub: number): string {
  if (Math.abs(valRub) < 1_000) return '0 ₽';
  const sign = valRub > 0 ? '+' : '−';
  const abs = Math.abs(valRub);
  if (abs < 100_000) {
    return `${sign}${Math.round(abs).toLocaleString('ru-RU')} ₽`;
  }
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
    // Для предоплат Q1 конца предыдущего года перенос в следующий месяц в рамках периода переводит платёж в Февраль
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

function shiftCapitalInjectionOneMonth(dateIso: string): string {
  const m = (dateIso || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '2027-02-10';
  let yr = Number(m[1]);
  let mo = Number(m[2]) + 1;
  const day = Math.min(28, Math.max(1, Number(m[3])));
  if (mo > 12) {
    mo = 1;
    yr += 1;
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
  onOpenMissingCostSku?: (modelId?: string, brandCode?: CanonicalBrandCode) => void;
  extraDetailedAnalyticsSlot?: React.ReactNode;
  initialFocusOpKey?: string | null;
  initialExpandedMonthIdx?: number | null;
  isModal?: boolean;
  onCloseModal?: () => void;
}

// Раздел 2 ТЗ: Переключатель брендов: BORNERS / FUKAI · AKUSHA · LISKANI · НА ТЕЛЕ · Все бренды
const BRAND_PILLS: { code: 'ALL' | CanonicalBrandCode | 'BORNERS_FUKAI'; label: string }[] = [
  { code: 'BORNERS_FUKAI', label: 'BORNERS / FUKAI' },
  { code: 'AKUSHA', label: 'AKUSHA' },
  { code: 'LISKANI', label: 'LISKANI' },
  { code: 'NA_TELE', label: 'НА ТЕЛЕ' },
  { code: 'ALL', label: 'Все бренды' },
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
  onOpenMissingCostSku,
  extraDetailedAnalyticsSlot,
  initialFocusOpKey,
  initialExpandedMonthIdx,
  isModal = false,
  onCloseModal,
}: InvestmentSchedulePanelProps) {
  const { currentUser, navigateTo } = usePlatform();
  const hasFinance = canUserViewFinance(currentUser);
  const hasCost = canUserViewCostPrice(currentUser);
  const authorName = currentUser?.fullName || 'Владелец';

  const rawUpperBrand = (brandFilter || 'ALL').trim().toUpperCase();
  const isRawBornersFukai =
    rawUpperBrand === 'BORNERS_FUKAI' ||
    rawUpperBrand === 'BORNERS / FUKAI' ||
    rawUpperBrand === 'BORNERS+FUKAI';
  const normBrand: 'ALL' | CanonicalBrandCode =
    !brandFilter || rawUpperBrand === 'ALL'
      ? 'ALL'
      : isRawBornersFukai
      ? 'BORNERS'
      : normalizePortfolioBrandCode(brandFilter);
  const isBornersFukaiScope =
    brandFilter === 'BORNERS_FUKAI' ||
    isRawBornersFukai ||
    normBrand === 'BORNERS' ||
    normBrand === 'FUKAI';
  const scheduleBrandFilter =
    normBrand === 'ALL' ? 'ALL' : isBornersFukaiScope ? 'BORNERS_FUKAI' : normBrand;

  const canEdit =
    hasFinance &&
    hasCost &&
    (normBrand === 'ALL'
      ? (['BORNERS', 'FUKAI', 'AKUSHA', 'LISKANI', 'NA_TELE'] as const).some((c) =>
          canUserEditBrand(currentUser, c)
        )
      : isBornersFukaiScope
      ? canUserEditBrand(currentUser, 'BORNERS') || canUserEditBrand(currentUser, 'FUKAI')
      : canUserEditBrand(currentUser, normBrand));

  const {
    ledgerState,
    schedule,
    resetPreview,
    planComparison,
    holdingOverview,
    activeCapitalInjections,
    selectedYear,
    setSelectedYear,
    saveStatus,
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
    brandFilter: scheduleBrandFilter,
    selectedScenarioByBrand,
    includeGroupPortfolioInS1,
  });

  // Раскрытые строки в блоке «Когда и сколько вложить» (Раздел 4)
  const [expandedWhenDates, setExpandedWhenDates] = useState<Set<string>>(() => new Set());
  // Показать также плановые платежи фабрикам, которые полностью покрываются реинвестированием
  const [showAllFactoryPayments, setShowAllFactoryPayments] = useState(false);

  // Выбранный месяц на основном графике «Свободные деньги бизнеса» (Раздел 8)
  const [selectedFreeCashMonthIdx, setSelectedFreeCashMonthIdx] = useState<number | null>(() =>
    typeof initialExpandedMonthIdx === 'number' && initialExpandedMonthIdx >= 0
      ? initialExpandedMonthIdx
      : null
  );

  // Раскрывающиеся панели: «Изменить план инвестиций» (Раздел 5), «Сравнить с исходным планом» (Раздел 9), «Подробная аналитика» (Разделы 3 и 8)
  const [showEditInvestmentPlan, setShowEditInvestmentPlan] = useState(false);
  const [showBaselineComparison, setShowBaselineComparison] = useState(false);
  const [showDetailedAnalytics, setShowDetailedAnalytics] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(() => {
    const init = new Set<number>();
    if (typeof initialExpandedMonthIdx === 'number' && initialExpandedMonthIdx >= 0) {
      init.add(initialExpandedMonthIdx);
    }
    return init;
  });

  const [selectedOpId, setSelectedOpId] = useState<string | null>(null);
  const [showAddOperationForm, setShowAddOperationForm] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [showResetPreviewModal, setShowResetPreviewModal] = useState(false);

  // Поля формы добавления собственной инвестиции (Раздел 5): по умолчанию подставляем дату ближайшей потребности в деньгах
  const [injDateIso, setInjDateIso] = useState(
    () => schedule.whenAndHowMuchRows[0]?.dateIso || `${schedule.scenarioYear}-01-01`
  );
  const [injAmountMln, setInjAmountMln] = useState('5');
  const [injTitle, setInjTitle] = useState('Вложение собственных средств');
  const [injComment, setInjComment] = useState('Собственные средства учредителя');
  const [injStatus, setInjStatus] = useState<OperationPaymentStatus>('Запланировано');
  const [editingInjId, setEditingInjId] = useState<string | null>(null);
  const [confirmDeleteCommittedInjId, setConfirmDeleteCommittedInjId] = useState<string | null>(
    null
  );

  const lastSyncedInjYearRef = useRef(schedule.scenarioYear);
  useEffect(() => {
    if (lastSyncedInjYearRef.current !== schedule.scenarioYear) {
      lastSyncedInjYearRef.current = schedule.scenarioYear;
      setInjDateIso(
        schedule.whenAndHowMuchRows[0]?.dateIso || `${schedule.scenarioYear}-01-01`
      );
    }
  }, [schedule.scenarioYear, schedule.whenAndHowMuchRows]);

  // Поля формы добавления планового расхода / операции (в «Подробной аналитике»)
  const [opKind, setOpKind] = useState<'expense' | 'inflow'>('expense');
  const [opCategory, setOpCategory] =
    useState<CustomCashOperationRecord['category']>('opex');
  const [opDateIso, setOpDateIso] = useState(`${schedule.scenarioYear}-02-10`);
  const [opAmountMln, setOpAmountMln] = useState('1.5');
  const [opTitle, setOpTitle] = useState('Реклама, логистика и операционные расходы');
  const [opSupplier, setOpSupplier] = useState('');
  const [opBatchKey, setOpBatchKey] = useState('');
  const [opStatus, setOpStatus] = useState<OperationPaymentStatus>('Запланировано');

  // Локальные черновики инспектора выбранного закупочного платежа (Раздел 6)
  const selectedEvent: ChronologicalCashEvent | null = useMemo(() => {
    if (!selectedOpId) return null;
    return (
      schedule.allEvents.find((e) => e.id === selectedOpId || e.opKey === selectedOpId) ||
      null
    );
  }, [schedule.allEvents, selectedOpId]);

  const linkedWhenPaymentItem: WhenAndHowMuchFactoryPaymentItem | null = useMemo(() => {
    if (!selectedEvent) return null;
    for (const row of schedule.whenAndHowMuchRows) {
      const found = row.factoryPayments.find(
        (fp) => fp.opKey === selectedEvent.opKey || fp.event.id === selectedEvent.id
      );
      if (found) return found;
    }
    return null;
  }, [schedule.whenAndHowMuchRows, selectedEvent]);

  const pairedBalanceEvent: ChronologicalCashEvent | null = useMemo(() => {
    if (!selectedEvent?.batchKey) return null;
    return (
      schedule.allEvents.find(
        (e) =>
          e.type === 'factory_payment' &&
          e.batchKey === selectedEvent.batchKey &&
          e.paymentRole === 'balance'
      ) || null
    );
  }, [schedule.allEvents, selectedEvent]);

  const [editDateIso, setEditDateIso] = useState('');
  const [editAmountRub, setEditAmountRub] = useState('');
  const [editSupplier, setEditSupplier] = useState('');
  const [editStatus, setEditStatus] = useState<OperationPaymentStatus>('Запланировано');
  const [editPrepayPct, setEditPrepayPct] = useState('30');
  const [editBalanceDateIso, setEditBalanceDateIso] = useState('');
  const [editPacksQty, setEditPacksQty] = useState('');
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
        setExpandedWhenDates((prev) => new Set(prev).add(targetEv.dateIso));
        setSelectedFreeCashMonthIdx(targetEv.calendarMonthIdx);
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
    setEditPacksQty(
      selectedEvent.batchDetails ? String(selectedEvent.batchDetails.packsQty) : ''
    );
    setEditBalanceDateIso(
      linkedWhenPaymentItem?.balanceDateIso || pairedBalanceEvent?.dateIso || ''
    );
    setLockedEditConfirmed(false);
    setSplitModeOpen(false);
    const half1 = Math.round(selectedEvent.amountRub * 0.5);
    const half2 = Math.max(0, selectedEvent.amountRub - half1);
    setSplitDrafts([
      {
        id: 'tr-1',
        dateIso: selectedEvent.dateIso,
        amountRub: half1,
        label: 'Часть 1 (50%)',
        status: selectedEvent.status,
      },
      {
        id: 'tr-2',
        dateIso: addDaysToIsoDate(selectedEvent.dateIso, 21),
        amountRub: half2,
        label: 'Часть 2 (50%)',
        status: selectedEvent.status,
      },
    ]);
  }, [selectedEvent, linkedWhenPaymentItem, pairedBalanceEvent]);

  const availableBrandScenarios = useMemo(() => {
    if (normBrand === 'ALL') return [];
    const targetBrand: CanonicalBrandCode = isBornersFukaiScope ? 'BORNERS' : normBrand;
    return getScenariosForBrand(scenarios, targetBrand, { onlyExplicitForNewBrands: false });
  }, [scenarios, normBrand, isBornersFukaiScope]);

  const allFactoryPaymentEvents = useMemo(
    () => schedule.allEvents.filter((e) => e.type === 'factory_payment'),
    [schedule.allEvents]
  );

  const handleSelectBrandPill = (code: 'ALL' | CanonicalBrandCode | 'BORNERS_FUKAI') => {
    if (!onSelectBrandFilter) return;
    if (code === 'BORNERS_FUKAI' || code === 'BORNERS' || code === 'FUKAI') {
      onSelectBrandFilter('BORNERS_FUKAI');
      if (onSelectScenarioId) {
        const brandScenarios = getScenariosForBrand(scenarios, 'BORNERS', {
          onlyExplicitForNewBrands: false,
        });
        const savedScenId = selectedScenarioByBrand?.BORNERS ?? 1;
        const effectiveScenId =
          savedScenId === 100 && brandScenarios.some((s) => s.id === 1) ? 1 : savedScenId;
        if (effectiveScenId && brandScenarios.some((s) => s.id === effectiveScenId)) {
          onSelectScenarioId(effectiveScenId, 'BORNERS');
        } else if (brandScenarios.some((s) => s.id === 1)) {
          onSelectScenarioId(1, 'BORNERS');
        } else if (
          brandScenarios.length > 0 &&
          !brandScenarios.some((s) => s.id === activeScenario.id)
        ) {
          onSelectScenarioId(brandScenarios[0].id, 'BORNERS');
        }
      }
      return;
    }

    onSelectBrandFilter(code);
    if (code !== 'ALL' && onSelectScenarioId) {
      const savedScenId =
        selectedScenarioByBrand?.[code] ??
        (code === 'LISKANI' ? selectedScenarioByBrand?.LISCANI : undefined);
      const brandScenarios = getScenariosForBrand(scenarios, code, {
        onlyExplicitForNewBrands: false,
      });
      if (savedScenId && brandScenarios.some((s) => s.id === savedScenId)) {
        onSelectScenarioId(savedScenId, code);
      } else if (
        brandScenarios.length > 0 &&
        !brandScenarios.some((s) => s.id === activeScenario.id)
      ) {
        onSelectScenarioId(brandScenarios[0].id, code);
      }
    }
  };

  const toggleWhenRow = (dateIso: string) => {
    setExpandedWhenDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateIso)) next.delete(dateIso);
      else next.add(dateIso);
      return next;
    });
  };

  const toggleMonthExpand = (mIdx: number) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(mIdx)) next.delete(mIdx);
      else next.add(mIdx);
      return next;
    });
  };

  const handleJumpToProcurementBatch = (
    modelId: string,
    brandCode?: CanonicalBrandCode | 'BORNERS_FUKAI' | string
  ) => {
    const resolvedBrandCode: CanonicalBrandCode | undefined =
      !brandCode || brandCode === 'ALL'
        ? undefined
        : brandCode === 'BORNERS_FUKAI'
        ? 'BORNERS'
        : (() => {
            const norm = normalizePortfolioBrandCode(brandCode);
            return norm === 'ALL' ? undefined : norm;
          })();
    if (onOpenBatchInProcurement) {
      onOpenBatchInProcurement(modelId, resolvedBrandCode);
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
    navigateTo('roadmap-tasks', resolvedBrandCode ? { brandId: resolvedBrandCode } : undefined);
    if (onCloseModal) onCloseModal();
  };

  const handleRecommendationAction = (rec: SystemActionRecommendation) => {
    if (rec.actionTarget === 'focus_payment_date') {
      const targetIso =
        rec.targetDateIso || schedule.whenAndHowMuchRows[0]?.dateIso || null;
      if (targetIso) {
        setExpandedWhenDates((prev) => new Set(prev).add(targetIso));
      }
      if (typeof document !== 'undefined') {
        const el = document.getElementById('when-and-how-much-anchor');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    if (rec.actionTarget === 'open_procurement') {
      if (rec.modelId) {
        handleJumpToProcurementBatch(
          rec.modelId,
          normBrand === 'ALL' ? undefined : normBrand
        );
      } else {
        navigateTo('roadmap-tasks');
        if (onCloseModal) onCloseModal();
      }
      return;
    }
    if (rec.actionTarget === 'open_missing_cost_sku') {
      if (onOpenMissingCostSku) {
        onOpenMissingCostSku(
          rec.modelId,
          normBrand === 'ALL' ? undefined : normBrand
        );
        if (onCloseModal) onCloseModal();
        return;
      }
      if (rec.modelId && typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem('borners_focus_procurement_sku_id', rec.modelId);
          window.localStorage.setItem('borners_procurement_selected_sku_v1', rec.modelId);
        } catch {
          // ignore
        }
      }
      navigateTo(
        'product-catalog',
        normBrand === 'ALL' ? undefined : { brandId: normBrand }
      );
      if (onCloseModal) onCloseModal();
      return;
    }
    if (rec.actionTarget === 'open_investment_settings') {
      setShowEditInvestmentPlan(true);
    }
  };

  const handleQuickShiftFactoryPaymentNextMonth = (ev: ChronologicalCashEvent) => {
    if (!canEdit || ev.isApprovedLocked) {
      setSelectedOpId(ev.id);
      return;
    }
    const nextIso = shiftIsoDateToNextMonth(ev.dateIso, schedule.scenarioYear);
    updatePaymentOperation({
      opKey: ev.opKey,
      batchKey: ev.batchKey || '',
      scenarioScopeKey: ev.scenarioScopeKey,
      isApprovedPo: Boolean(ev.batchDetails?.isApprovedPo),
      currentTitle: ev.title,
      beforeSummary: `${formatIsoDateHumanRu(ev.dateIso)} · ${fmtRub(ev.amountRub)}`,
      patch: { customDateIso: nextIso },
      author: authorName,
    });
  };

  const handleSaveSelectedPaymentInspector = () => {
    if (!selectedEvent || !canEdit) return;
    if (selectedEvent.isApprovedLocked && !lockedEditConfirmed) return;

    const cleanAmount = Math.max(
      0,
      Math.round(Number(editAmountRub) || selectedEvent.amountRub)
    );
    updatePaymentOperation({
      opKey: selectedEvent.opKey,
      batchKey: selectedEvent.batchKey || '',
      scenarioScopeKey: selectedEvent.scenarioScopeKey,
      isApprovedPo: Boolean(selectedEvent.batchDetails?.isApprovedPo),
      currentTitle: selectedEvent.title,
      beforeSummary: `${formatIsoDateHumanRu(selectedEvent.dateIso)} · ${fmtRub(selectedEvent.amountRub)} (${selectedEvent.status})`,
      patch: {
        customDateIso: editDateIso || selectedEvent.dateIso,
        customAmountRub:
          cleanAmount !== selectedEvent.autoAmountRub ? cleanAmount : undefined,
        customFactoryName: editSupplier.trim() || undefined,
        status: editStatus,
        splitTranches: splitModeOpen ? splitDrafts : undefined,
      },
      author: authorName,
    });

    // Раздел 6: Изменение даты окончательного платежа
    if (
      pairedBalanceEvent &&
      pairedBalanceEvent.opKey !== selectedEvent.opKey &&
      editBalanceDateIso &&
      editBalanceDateIso !== pairedBalanceEvent.dateIso
    ) {
      updatePaymentOperation({
        opKey: pairedBalanceEvent.opKey,
        batchKey: pairedBalanceEvent.batchKey || '',
        scenarioScopeKey: pairedBalanceEvent.scenarioScopeKey,
        isApprovedPo: Boolean(pairedBalanceEvent.batchDetails?.isApprovedPo),
        currentTitle: pairedBalanceEvent.title,
        beforeSummary: `${formatIsoDateHumanRu(pairedBalanceEvent.dateIso)} · ${fmtRub(pairedBalanceEvent.amountRub)}`,
        patch: { customDateIso: editBalanceDateIso },
        author: authorName,
      });
    }

    // Раздел 6: Изменение предоплаты (%), поставщика, объёма или срока поставки плановой партии
    if (selectedEvent.batchDetails && selectedEvent.batchKey) {
      const pctNum = Math.max(
        0,
        Math.min(
          100,
          Math.round(Number(editPrepayPct) || selectedEvent.batchDetails.prepaymentPct)
        )
      );
      const packsNum = Math.max(
        0,
        Math.round(Number(editPacksQty) || selectedEvent.batchDetails.packsQty)
      );
      const pctChanged = pctNum !== selectedEvent.batchDetails.prepaymentPct;
      const arrivalChanged =
        Boolean(editArrivalDateIso) &&
        editArrivalDateIso !== selectedEvent.batchDetails.arrivalDateIso;
      const supplierChanged =
        Boolean(editSupplier.trim()) &&
        editSupplier.trim() !== selectedEvent.batchDetails.factoryName;
      const packsChanged =
        editPacksQty !== '' && packsNum !== selectedEvent.batchDetails.packsQty;

      if (pctChanged || arrivalChanged || supplierChanged || packsChanged) {
        updateBatchTerms({
          batchKey: selectedEvent.batchKey,
          scenarioScopeKey: selectedEvent.scenarioScopeKey,
          isApprovedPo: selectedEvent.batchDetails.isApprovedPo,
          batchTitle: `${selectedEvent.batchDetails.modelCode} · ${selectedEvent.batchDetails.periodId.toUpperCase()}`,
          beforeSummary: `Объём ${selectedEvent.batchDetails.packsQty.toLocaleString('ru-RU')} ${selectedEvent.batchDetails.primaryUnitLabel}, аванс ${selectedEvent.batchDetails.prepaymentPct}%, поставка ${formatIsoDateHumanRu(selectedEvent.batchDetails.arrivalDateIso)}`,
          patch: {
            customPrepaymentPct: pctChanged ? pctNum : undefined,
            customArrivalDateIso: arrivalChanged ? editArrivalDateIso : undefined,
            customFactoryName: supplierChanged ? editSupplier.trim() : undefined,
            customPacksQty: packsChanged ? packsNum : undefined,
          },
          author: authorName,
        });
      }
    }

    setSelectedOpId(null);
  };

  const handleSubmitCapitalInjection = () => {
    const mln = Number(String(injAmountMln).replace(',', '.'));
    if (!Number.isFinite(mln) || mln <= 0) return;
    const id = editingInjId || `cap-${Date.now()}`;
    saveCapitalInjection(
      {
        id,
        dateIso: injDateIso || `${schedule.scenarioYear}-01-10`,
        amountRub: Math.round(mln * 1_000_000),
        title: injTitle.trim() || 'Собственное вложение',
        sourceComment: injComment.trim() || undefined,
        status: injStatus,
      },
      schedule.activeScopeKey,
      authorName
    );
    setEditingInjId(null);
    setInjTitle('Вложение собственных средств');
    setInjComment('Собственные средства учредителя');
  };

  const handleInlineUpdateInjection = (
    inj: CapitalInjectionRecord,
    patch: Partial<CapitalInjectionRecord>
  ) => {
    saveCapitalInjection(
      {
        id: inj.id,
        dateIso: patch.dateIso ?? inj.dateIso,
        amountRub: patch.amountRub ?? inj.amountRub,
        title: patch.title ?? inj.title,
        sourceComment:
          patch.sourceComment !== undefined ? patch.sourceComment : inj.sourceComment,
        status: patch.status ?? inj.status,
      },
      schedule.activeScopeKey,
      authorName
    );
  };

  if (!hasFinance || !hasCost) {
    return (
      <div className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-6 text-center space-y-1.5">
        <div className="text-[14px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
          Финансовый план и управление инвестициями ограничены правами роли
        </div>
        <p className="text-xs text-[#5C5953] dark:text-[#9A968E]">
          Для просмотра закупочных платежей, реинвестирования от продаж и потребности в капитале необходим доступ к финансам и себестоимости.
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

  // Данные для графика «Свободные деньги бизнеса» (Раздел 8)
  const maxAbsFreeCash = useMemo(() => {
    let m = 1_000_000;
    for (const row of schedule.monthlyCalendarRows) {
      m = Math.max(m, Math.abs(row.businessFreeCashRub));
    }
    return m;
  }, [schedule.monthlyCalendarRows]);

  const selectedFreeCashRow =
    selectedFreeCashMonthIdx !== null
      ? schedule.monthlyCalendarRows[selectedFreeCashMonthIdx] || null
      : null;

  const scheduleWithPnl = schedule as ComputedInvestmentScheduleResult & {
    totalWbDeductionsRub?: number;
    totalSoldGoodsCostRub?: number;
  };
  const resolvedWbDeductionsRub =
    typeof scheduleWithPnl.totalWbDeductionsRub === 'number'
      ? scheduleWithPnl.totalWbDeductionsRub
      : Math.round(schedule.totalGrossSalesRevenueRub * 0.4);
  const resolvedNetWbProceedsRub = Math.max(
    0,
    schedule.totalGrossSalesRevenueRub - resolvedWbDeductionsRub
  );
  const resolvedSoldGoodsCostRub =
    typeof scheduleWithPnl.totalSoldGoodsCostRub === 'number'
      ? scheduleWithPnl.totalSoldGoodsCostRub
      : Math.max(
          0,
          schedule.totalGrossSalesRevenueRub -
            resolvedWbDeductionsRub -
            schedule.totalAccrualOperatingProfitRub
        );
  const resolvedOperatingProfitRub =
    schedule.totalAccrualOperatingProfitRub - schedule.totalOtherExpensesRub;
  const resolvedOperatingMarginPct =
    schedule.totalGrossSalesRevenueRub > 0
      ? Math.round((resolvedOperatingProfitRub / schedule.totalGrossSalesRevenueRub) * 1000) / 10
      : 0;

  return (
    <div
      data-testid="investment-schedule-root"
      className="space-y-5"
    >
      {/* РАЗДЕЛ 2 ТЗ: ВЕРХНЯЯ ПАНЕЛЬ (БРЕНД / СЦЕНАРИЙ / ГОД 2027–2028 + СТАТУС СОХРАНЕНИЯ) */}
      <div className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] px-4 py-3.5 sm:px-5 shadow-[0_1px_2px_rgba(20,20,19,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {/* 1. Бренд */}
            {onSelectBrandFilter && (
              <div
                role="group"
                aria-label="Выбор бренда"
                className="inline-flex flex-wrap items-center gap-0.5 max-w-full rounded-lg bg-[#FAF9F6] dark:bg-[#1D1C1A] p-1 border border-[#E4E1DA] dark:border-[#282724]"
              >
                {BRAND_PILLS.map((bp) => {
                  const isAct =
                    bp.code === 'BORNERS_FUKAI'
                      ? normBrand !== 'ALL' && isBornersFukaiScope
                      : normBrand === bp.code;
                  return (
                    <button
                      key={bp.code}
                      type="button"
                      data-testid={`fin-brand-pill-${bp.code}`}
                      onClick={() => handleSelectBrandPill(bp.code)}
                      className={`h-7 px-2.5 rounded-md text-[12px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                        isAct
                          ? 'bg-[#141413] dark:bg-[#F5F4F0] text-white dark:text-[#141413]'
                          : 'text-[#5C5953] dark:text-[#9A968E] hover:text-[#141413] dark:hover:text-[#F5F4F0]'
                      }`}
                    >
                      {bp.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* 2. Сценарий */}
            {normBrand !== 'ALL' &&
              onSelectScenarioId &&
              availableBrandScenarios.length > 0 && (
                <select
                  aria-label="Сценарий продаж бренда"
                  data-testid="inv-scenario-select"
                  value={
                    availableBrandScenarios.some((sc) => sc.id === activeScenario.id)
                      ? activeScenario.id
                      : availableBrandScenarios[0]?.id ?? activeScenario.id
                  }
                  onChange={(e) =>
                    onSelectScenarioId(
                      Number(e.target.value),
                      isBornersFukaiScope ? 'BORNERS' : normBrand
                    )
                  }
                  className="h-9 max-w-[260px] sm:max-w-[340px] truncate px-3 rounded-lg bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-xs font-medium text-[#141413] dark:text-[#F5F4F0]"
                >
                  {availableBrandScenarios.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.title}
                    </option>
                  ))}
                </select>
              )}

            {normBrand === 'ALL' && (
              <span className="inline-flex items-center min-h-9 py-1 px-3 rounded-lg bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-xs text-[#5C5953] dark:text-[#9A968E]">
                Консолидированная сводка по выбранным сценариям брендов
              </span>
            )}

            {/* 3. Год: 2027 / 2028 */}
            <div
              role="group"
              aria-label="Год расчёта"
              className="inline-flex items-center shrink-0 gap-0.5 rounded-lg bg-[#FAF9F6] dark:bg-[#1D1C1A] p-1 border border-[#E4E1DA] dark:border-[#282724]"
            >
              {([2027, 2028] as const).map((yr) => {
                const isYr = selectedYear === yr;
                return (
                  <button
                    key={yr}
                    type="button"
                    data-testid={`fin-year-${yr}`}
                    onClick={() => setSelectedYear(yr, authorName)}
                    className={`h-7 px-2.5 rounded-md font-mono text-[12px] font-medium cursor-pointer transition-colors ${
                      isYr
                        ? 'bg-[#141413] dark:bg-[#F5F4F0] text-white dark:text-[#141413]'
                        : 'text-[#5C5953] dark:text-[#9A968E] hover:text-[#141413]'
                    }`}
                  >
                    {yr}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Статус сохранения между устройствами (Раздел 11) + управление окном */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="fin-save-status"
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-[11.5px] text-[#5C5953] dark:text-[#9A968E]"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  saveStatus === 'saving' ? 'bg-amber-500 animate-pulse' : 'bg-[#15803D]'
                }`}
              />
              <span>
                {saveStatus === 'saving'
                  ? 'Сохранение...'
                  : saveStatus === 'saved_cloud'
                  ? 'Сохранено'
                  : 'Сохранено локально'}
              </span>
            </span>

            <button
              type="button"
              data-testid="btn-audit-history"
              onClick={() => setShowHistoryDrawer((v) => !v)}
              className="h-8 px-2.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] hover:border-[#141413] text-[#141413] dark:text-[#F5F4F0] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <History className="h-3.5 w-3.5 text-[#5C5953]" strokeWidth={1.5} />
              <span>История ({ledgerState.auditHistory.length})</span>
            </button>

            {isModal && onCloseModal && (
              <button
                type="button"
                aria-label="Закрыть календарь инвестиций"
                onClick={onCloseModal}
                className="h-8 w-8 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] text-[#5C5953] hover:text-[#141413] inline-flex items-center justify-center cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Компактная цепочка логики раздела */}
        <div className="mt-2.5 pt-2.5 border-t border-[#E4E1DA] dark:border-[#282724] flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[#5C5953] dark:text-[#9A968E]">
          <span>
            Сколько продаём → Сколько закупаем → Когда нужны деньги → Что оплачивается из продаж → Сколько своих средств вложить
          </span>
          {schedule.lockedOperationsCount > 0 && (
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#15803D] dark:text-emerald-400">
              <Lock className="h-3 w-3" />
              <span>Утверждённых и фактических операций: {schedule.lockedOperationsCount}</span>
            </span>
          )}
        </div>
      </div>

      {/* РАЗДЕЛ 3 ТЗ: ГЛАВНЫЙ ЭКРАН — ТОЛЬКО ЧЕТЫРЕ ПОКАЗАТЕЛЯ */}
      <div
        data-testid="fin-four-main-kpis"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5"
      >
        {/* 1. План продаж */}
        <div className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-4 sm:p-5 shadow-[0_1px_2px_rgba(20,20,19,0.04)] flex flex-col justify-between">
          <div>
            <div className="text-[12px] font-medium text-[#5C5953] dark:text-[#9A968E]">
              1. План продаж
            </div>
            <div
              data-testid="fin-kpi-sales-plan"
              className="mt-2 font-mono text-2xl sm:text-[26px] font-semibold tracking-[-0.025em] tabular-nums text-[#141413] dark:text-[#F5F4F0]"
            >
              {fmtMln(schedule.totalGrossSalesRevenueRub)}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-[#E4E1DA] dark:border-[#282724] text-[11.5px] text-[#5C5953] dark:text-[#9A968E]">
            Прогнозируемая выручка · {selectedYear} г.
          </div>
        </div>

        {/* 2. Стоимость закупок */}
        <div className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-4 sm:p-5 shadow-[0_1px_2px_rgba(20,20,19,0.04)] flex flex-col justify-between">
          <div>
            <div className="text-[12px] font-medium text-[#5C5953] dark:text-[#9A968E]">
              2. Стоимость закупок
            </div>
            <div
              data-testid="fin-kpi-procurement-cost"
              className="mt-2 font-mono text-2xl sm:text-[26px] font-semibold tracking-[-0.025em] tabular-nums text-[#141413] dark:text-[#F5F4F0]"
            >
              {fmtMln(schedule.totalProcurementCostRub)}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-[#E4E1DA] dark:border-[#282724] text-[11.5px] text-[#5C5953] dark:text-[#9A968E]">
            {schedule.batchesTotalCount} закупочных партий за период
          </div>
        </div>

        {/* 3. Максимальная потребность в своих деньгах */}
        <div className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-4 sm:p-5 shadow-[0_1px_2px_rgba(20,20,19,0.04)] flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="text-[12px] font-medium text-[#5C5953] dark:text-[#9A968E]">
                3. Максимальная потребность в своих деньгах
              </div>
              {schedule.isPreliminaryCalculation && (
                <span
                  data-testid="fin-preliminary-badge"
                  className="shrink-0 rounded px-1.5 py-0.5 bg-amber-500/12 border border-amber-500/30 font-mono text-[10px] font-medium text-amber-800 dark:text-amber-300"
                >
                  Предварительно
                </span>
              )}
            </div>
            <div
              data-testid="fin-kpi-max-own-money"
              className="mt-2 font-mono text-2xl sm:text-[26px] font-semibold tracking-[-0.025em] tabular-nums text-[#141413] dark:text-[#F5F4F0]"
            >
              {!schedule.wbPayoutScheduleSpecified
                ? 'Укажите срок WB'
                : schedule.calculatedCapitalNeedRub !== null
                ? fmtMln(schedule.calculatedCapitalNeedRub)
                : '0,00 млн ₽'}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-[#E4E1DA] dark:border-[#282724] text-[11.5px] text-[#5C5953] dark:text-[#9A968E] space-y-0.5">
            <div>
              {schedule.wbPayoutScheduleSpecified
                ? `Пик потребности: ${schedule.peakShortageMonthFullRu}`
                : 'Требуется срок поступления выручки от WB'}
            </div>
            {schedule.totalOwnMoneyConfiguredRub > 0 &&
              schedule.remainingOwnMoneyNeededRub !== null && (
                <div className="font-mono text-[11px] text-[#15803D] dark:text-emerald-400">
                  Внесено: {fmtMln(schedule.totalOwnMoneyConfiguredRub)} · Осталось:{' '}
                  {fmtMln(schedule.remainingOwnMoneyNeededRub)}
                </div>
              )}
          </div>
        </div>

        {/* 4. Реинвестирование */}
        <div className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-4 sm:p-5 shadow-[0_1px_2px_rgba(20,20,19,0.04)] flex flex-col justify-between">
          <div>
            <div className="text-[12px] font-medium text-[#5C5953] dark:text-[#9A968E]">
              4. Реинвестирование
            </div>
            <div
              data-testid="inv-reinvested-value"
              className="mt-2 font-mono text-2xl sm:text-[26px] font-semibold tracking-[-0.025em] tabular-nums text-[#15803D] dark:text-emerald-400"
            >
              {!schedule.wbPayoutScheduleSpecified ||
              schedule.reinvestedFromSalesRub === null
                ? '—'
                : fmtMln(schedule.reinvestedFromSalesRub)}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-[#E4E1DA] dark:border-[#282724] text-[11.5px] text-[#5C5953] dark:text-[#9A968E]">
            {schedule.wbPayoutScheduleSpecified
              ? `Покрыто поступлениями от продаж (${schedule.reinvestedSharePct}% закупок)`
              : 'Рассчитывается по операциям поступлений от продаж'}
          </div>
        </div>
      </div>

      {/* СВОДНАЯ ПОЛОСА РАСХОДОВ, УДЕРЖАНИЙ WB, СЕБЕСТОИМОСТИ И ОПЕРАЦИОННОЙ ПРИБЫЛИ */}
      <div
        data-testid="fin-expenses-profit-strip"
        className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-4 sm:p-5 shadow-[0_1px_2px_rgba(20,20,19,0.04)] space-y-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <h3 className="text-[13.5px] sm:text-[14px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
              Расходы, удержания WB и прибыльность · {selectedYear}
            </h3>
            <p className="text-[11.5px] text-[#5C5953] dark:text-[#9A968E]">
              Удержания маркетплейса, чистые поступления на счёт, себестоимость выкупов и операционная прибыль
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <button
                type="button"
                data-testid="fin-strip-add-expense-btn"
                onClick={() => {
                  setShowDetailedAnalytics(true);
                  setShowAddOperationForm(true);
                  setOpKind('expense');
                  if (typeof window !== 'undefined') {
                    window.requestAnimationFrame(() => {
                      setTimeout(() => {
                        const el = document.getElementById('fin-custom-expenses-anchor');
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }, 40);
                    });
                  }
                }}
                className="h-8 px-3 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] hover:border-[#141413] dark:hover:border-[#F5F4F0] text-xs font-medium text-[#141413] dark:text-[#F5F4F0] inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
              >
                <span>+ Добавить расход (ФОТ / ДРР / прочее)</span>
              </button>
            )}

            <button
              type="button"
              data-testid="fin-strip-toggle-analytics-btn"
              onClick={() => setShowDetailedAnalytics((v) => !v)}
              className="h-8 px-3 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] hover:border-[#141413] dark:hover:border-[#F5F4F0] text-xs font-medium text-[#141413] dark:text-[#F5F4F0] inline-flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors"
            >
              <span>Подробная аналитика и P&amp;L {showDetailedAnalytics ? '▴' : '▾'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {/* 1) Удержания и расходы WB */}
          <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-3.5 flex flex-col justify-between gap-2">
            <div>
              <div className="text-[12px] font-medium text-[#141413] dark:text-[#F5F4F0]">
                Удержания и расходы WB
              </div>
              <div className="text-[11px] text-[#5C5953] dark:text-[#9A968E]">
                комиссия, логистика, ДРР
              </div>
              <div
                data-testid="fin-strip-wb-deductions"
                className="mt-2 font-mono text-lg sm:text-xl font-semibold tracking-[-0.02em] tabular-nums text-[#141413] dark:text-[#F5F4F0]"
              >
                {fmtMln(resolvedWbDeductionsRub)}
              </div>
            </div>
            <div className="pt-2 border-t border-[#E4E1DA] dark:border-[#282724] text-[11px] text-[#5C5953] dark:text-[#9A968E]">
              <span>40% от выручки</span>
              {schedule.totalOtherExpensesRub > 0 && (
                <span className="font-mono text-amber-800 dark:text-amber-300">
                  {' '}
                  · + прочие расходы {fmtMln(schedule.totalOtherExpensesRub)}
                </span>
              )}
            </div>
          </div>

          {/* 2) Чистые поступления от WB */}
          <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-3.5 flex flex-col justify-between gap-2">
            <div>
              <div className="text-[12px] font-medium text-[#141413] dark:text-[#F5F4F0]">
                Чистые поступления от WB
              </div>
              <div className="text-[11px] text-[#5C5953] dark:text-[#9A968E]">
                к перечислению на счёт
              </div>
              <div
                data-testid="fin-strip-wb-net-proceeds"
                className="mt-2 font-mono text-lg sm:text-xl font-semibold tracking-[-0.02em] tabular-nums text-[#141413] dark:text-[#F5F4F0]"
              >
                {fmtMln(resolvedNetWbProceedsRub)}
              </div>
            </div>
            <div className="pt-2 border-t border-[#E4E1DA] dark:border-[#282724] text-[11px] text-[#5C5953] dark:text-[#9A968E]">
              60% выручки после удержаний МП
            </div>
          </div>

          {/* 3) Себестоимость продаж (COGS) */}
          <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-3.5 flex flex-col justify-between gap-2">
            <div>
              <div className="text-[12px] font-medium text-[#141413] dark:text-[#F5F4F0]">
                Себестоимость продаж (COGS)
              </div>
              <div className="text-[11px] text-[#5C5953] dark:text-[#9A968E]">
                себестоимость выкупленного товара
              </div>
              <div
                data-testid="fin-strip-cogs"
                className="mt-2 font-mono text-lg sm:text-xl font-semibold tracking-[-0.02em] tabular-nums text-[#141413] dark:text-[#F5F4F0]"
              >
                {fmtMln(resolvedSoldGoodsCostRub)}
              </div>
            </div>
            <div className="pt-2 border-t border-[#E4E1DA] dark:border-[#282724] text-[11px] text-[#5C5953] dark:text-[#9A968E]">
              отличается от закупок на величину складского запаса
            </div>
          </div>

          {/* 4) Операционная прибыль */}
          <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-3.5 flex flex-col justify-between gap-2">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[12px] font-medium text-[#141413] dark:text-[#F5F4F0]">
                    Операционная прибыль
                  </div>
                  <div className="text-[11px] text-[#5C5953] dark:text-[#9A968E]">
                    после себестоимости и всех расходов
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10.5px] font-medium border ${
                    resolvedOperatingProfitRub >= 0
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-[#15803D] dark:text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/25 text-[#B91C1C] dark:text-rose-400'
                  }`}
                >
                  {resolvedOperatingMarginPct.toFixed(1).replace('.', ',')}% от выручки
                </span>
              </div>
              <div
                data-testid="fin-strip-operating-profit"
                className={`mt-2 font-mono text-lg sm:text-xl font-semibold tracking-[-0.02em] tabular-nums ${
                  resolvedOperatingProfitRub >= 0
                    ? 'text-[#15803D] dark:text-emerald-400'
                    : 'text-[#B91C1C] dark:text-rose-400'
                }`}
              >
                {fmtMln(resolvedOperatingProfitRub)}
              </div>
            </div>
            <div className="pt-2 border-t border-[#E4E1DA] dark:border-[#282724] text-[11px] text-[#5C5953] dark:text-[#9A968E]">
              {schedule.totalOtherExpensesRub > 0
                ? `С учётом доп. расходов ${fmtMln(schedule.totalOtherExpensesRub)}`
                : 'Рентабельность продаж по плану периода'}
            </div>
          </div>
        </div>
      </div>

      {/* РАЗДЕЛ 7 ТЗ: КОМПАКТНЫЙ БЛОК «ЧТО НУЖНО СДЕЛАТЬ» (МАКСИМУМ 3 РЕКОМЕНДАЦИИ) */}
      {schedule.recommendations.length > 0 && (
        <div
          data-testid="fin-recommendations-block"
          className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-4 sm:p-5 shadow-[0_1px_2px_rgba(20,20,19,0.04)] space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13.5px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
              Что нужно сделать
            </span>
            <span className="text-[11.5px] text-[#5C5953] dark:text-[#9A968E]">
              По приоритету расчёта
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {schedule.recommendations.slice(0, 3).map((rec) => {
              const badgeCls =
                rec.severity === 'danger'
                  ? 'bg-rose-500/10 border-rose-500/25 text-[#B91C1C] dark:text-rose-300'
                  : rec.severity === 'warning'
                  ? 'bg-amber-500/10 border-amber-500/25 text-amber-900 dark:text-amber-300'
                  : 'bg-emerald-500/10 border-emerald-500/25 text-[#15803D] dark:text-emerald-300';
              return (
                <div
                  key={rec.id}
                  data-testid={`fin-rec-card-${rec.id}`}
                  className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-3.5 flex flex-col justify-between gap-2.5"
                >
                  <div className="space-y-1.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${badgeCls}`}
                    >
                      {rec.categoryLabel}
                    </span>
                    <p className="text-xs text-[#141413] dark:text-[#F5F4F0] leading-relaxed">
                      {rec.message}
                    </p>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => handleRecommendationAction(rec)}
                      className="h-8 px-3 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] hover:border-[#141413] text-xs font-medium text-[#141413] dark:text-[#F5F4F0] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <span>{rec.ctaLabel}</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* РАЗДЕЛ 10 ТЗ: ОБЩАЯ СВОДКА ГРУППЫ (при выборе «Все бренды») */}
      {normBrand === 'ALL' && holdingOverview && (
        <div
          data-testid="fin-holding-overview-section"
          className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-4 sm:p-5 shadow-[0_1px_2px_rgba(20,20,19,0.04)] space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-[14.5px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                Общая сводка группы · {selectedYear}
              </h3>
              <p className="text-xs text-[#5C5953] dark:text-[#9A968E]">
                Нажмите на бренд, чтобы открыть его финансовый план. Потребность группы рассчитана по единому денежному календарю без суммирования отдельных пиков.
              </p>
            </div>
            {holdingOverview.unifiedGroupSynergySavingsRub > 0 && (
              <span className="px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/25 font-mono text-[11px] font-medium text-[#15803D] dark:text-emerald-400">
                Экономия общего календаря: −{fmtMln(holdingOverview.unifiedGroupSynergySavingsRub)}
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-[#E4E1DA] dark:border-[#282724]">
            <table
              data-testid="fin-holding-overview-table"
              className="w-full min-w-[680px] border-collapse text-left text-xs"
            >
              <thead>
                <tr className="bg-[#FAF9F6] dark:bg-[#1D1C1A] border-b border-[#E4E1DA] dark:border-[#282724] text-[11px] uppercase tracking-wider text-[#5C5953] dark:text-[#9A968E]">
                  <th className="py-2.5 px-3.5 font-medium">Бренд</th>
                  <th className="py-2.5 px-3 font-medium text-right">Выручка</th>
                  <th className="py-2.5 px-3 font-medium text-right">Закупки</th>
                  <th className="py-2.5 px-3 font-medium text-right">Свои деньги</th>
                  <th className="py-2.5 px-3.5 font-medium">Ближайший платёж</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E1DA] dark:divide-[#282724]">
                {holdingOverview.rows.map((row) => (
                  <tr
                    key={row.brandCode}
                    data-testid={`fin-holding-row-${row.brandCode}`}
                    onClick={() => handleSelectBrandPill(row.brandCode)}
                    className="hover:bg-[#FAF9F6] dark:hover:bg-[#1D1C1A] cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-3.5">
                      <div className="font-semibold text-[#141413] dark:text-[#F5F4F0] inline-flex items-center gap-1.5">
                        <span>{row.displayBrandName}</span>
                        <ArrowUpRight className="h-3 w-3 text-[#5C5953]" />
                      </div>
                      <div className="text-[11px] text-[#5C5953] dark:text-[#9A968E]">
                        {row.scenarioName}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-medium text-[#141413] dark:text-[#F5F4F0]">
                      {row.revenueRub > 0 ? fmtMln(row.revenueRub) : '0,00 млн ₽'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[#141413] dark:text-[#F5F4F0]">
                      {row.procurementRub > 0 ? fmtMln(row.procurementRub) : '0,00 млн ₽'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-[#141413] dark:text-[#F5F4F0]">
                      {row.ownMoneyNeedRub !== null ? fmtMln(row.ownMoneyNeedRub) : '—'}
                      {row.remainingOwnMoneyRub !== null &&
                        row.ownMoneyNeedRub !== null &&
                        row.remainingOwnMoneyRub < row.ownMoneyNeedRub && (
                          <div className="text-[10.5px] font-normal text-[#15803D] dark:text-emerald-400">
                            осталось: {fmtMln(row.remainingOwnMoneyRub)}
                          </div>
                        )}
                    </td>
                    <td className="py-3 px-3.5 text-[#5C5953] dark:text-[#9A968E]">
                      {row.nextPayment ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono font-medium text-[#141413] dark:text-[#F5F4F0]">
                            {row.nextPayment.dateDotRu}
                          </span>
                          <span>·</span>
                          <span className="font-mono text-[#B91C1C] dark:text-rose-400">
                            {fmtMln(row.nextPayment.amountRub)}
                          </span>
                        </div>
                      ) : (
                        'Нет плановых платежей'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#FAF9F6] dark:bg-[#1D1C1A] border-t border-[#E4E1DA] dark:border-[#282724] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                  <td className="py-3 px-3.5">
                    BORNERS GROUP (единый календарь)
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    {fmtMln(schedule.totalGrossSalesRevenueRub)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    {fmtMln(schedule.totalProcurementCostRub)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    {holdingOverview.unifiedGroupCalculatedNeedRub !== null
                      ? fmtMln(holdingOverview.unifiedGroupCalculatedNeedRub)
                      : '—'}
                  </td>
                  <td className="py-3 px-3.5 font-normal text-[#5C5953] dark:text-[#9A968E]">
                    {schedule.nextUpcomingPayment
                      ? `${schedule.nextUpcomingPayment.dateDotRu} · ${fmtMln(schedule.nextUpcomingPayment.amountRub)}`
                      : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* РАЗДЕЛ 5 И РАЗДЕЛ 9 ТЗ: ОТДЕЛЬНАЯ РАЗБИВКА КАПИТАЛА + КНОПКИ «ИЗМЕНИТЬ ПЛАН ИНВЕСТИЦИЙ» И «СРАВНИТЬ С ИСХОДНЫМ ПЛАНОМ» */}
      <div className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-4 sm:p-5 shadow-[0_1px_2px_rgba(20,20,19,0.04)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Три раздельных показателя финансирования (Раздел 5: вложения НЕ уменьшают искусственно расчётную потребность) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6 flex-1 min-w-[280px]">
            <div>
              <div className="text-[11.5px] text-[#5C5953] dark:text-[#9A968E]">
                Общая расчётная потребность
              </div>
              <div
                data-testid="fin-cap-calculated"
                className="mt-0.5 font-mono text-base sm:text-lg font-semibold text-[#141413] dark:text-[#F5F4F0]"
              >
                {schedule.calculatedCapitalNeedRub !== null
                  ? fmtMln(schedule.calculatedCapitalNeedRub)
                  : '—'}
              </div>
            </div>

            <div>
              <div className="text-[11.5px] text-[#5C5953] dark:text-[#9A968E]">
                Уже внесённые и плановые свои деньги
              </div>
              <div
                data-testid="fin-cap-contributed"
                className="mt-0.5 font-mono text-base sm:text-lg font-semibold text-[#15803D] dark:text-emerald-400"
              >
                {fmtMln(schedule.totalOwnMoneyConfiguredRub)}
              </div>
              {schedule.factualOwnMoneyContributedRub > 0 && (
                <div className="text-[10.5px] text-[#5C5953] dark:text-[#9A968E]">
                  фактически оплачено: {fmtMln(schedule.factualOwnMoneyContributedRub)}
                </div>
              )}
            </div>

            <div>
              <div className="text-[11.5px] text-[#5C5953] dark:text-[#9A968E]">
                Оставшаяся сумма финансирования
              </div>
              <div
                data-testid="inv-still-needed-value"
                className={`mt-0.5 font-mono text-base sm:text-lg font-semibold ${
                  (schedule.remainingOwnMoneyNeededRub ?? 0) > 0
                    ? 'text-[#B91C1C] dark:text-rose-400'
                    : 'text-[#15803D] dark:text-emerald-400'
                }`}
              >
                {schedule.remainingOwnMoneyNeededRub === null
                  ? '—'
                  : schedule.remainingOwnMoneyNeededRub > 0
                  ? fmtMln(schedule.remainingOwnMoneyNeededRub)
                  : '0,00 млн ₽ (закрыто)'}
              </div>
              {schedule.totalOwnMoneyConfiguredRub > 0 &&
                (schedule.remainingOwnMoneyNeededRub ?? 0) >
                  Math.max(
                    0,
                    (schedule.calculatedCapitalNeedRub ?? 0) - schedule.totalOwnMoneyConfiguredRub
                  ) +
                    1000 && (
                  <div className="text-[10.5px] text-amber-700 dark:text-amber-300">
                    дата взноса позже платежа ({schedule.whenAndHowMuchRows[0]?.dateDotRu || ''})
                  </div>
                )}
            </div>
          </div>

          {/* Кнопки управления инвестициями и сравнения */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {canEdit && (
              <button
                type="button"
                data-testid="inv-add-capital-btn"
                onClick={() => {
                  if (!showEditInvestmentPlan && !editingInjId && schedule.whenAndHowMuchRows[0]?.dateIso) {
                    setInjDateIso(schedule.whenAndHowMuchRows[0].dateIso);
                  }
                  setShowEditInvestmentPlan((v) => !v);
                }}
                className={`h-9 px-3.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                  showEditInvestmentPlan
                    ? 'bg-[#282724] text-white'
                    : 'bg-[#141413] dark:bg-[#F5F4F0] text-white dark:text-[#141413] hover:opacity-90'
                }`}
              >
                <Wallet className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>Изменить план инвестиций</span>
              </button>
            )}

            <button
              type="button"
              data-testid="btn-compare-baseline"
              onClick={() => setShowBaselineComparison((v) => !v)}
              className={`h-9 px-3.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                showBaselineComparison || planComparison.hasDifferences
                  ? 'border-[#141413] dark:border-[#F5F4F0] bg-[#FAF9F6] dark:bg-[#1D1C1A] text-[#141413] dark:text-[#F5F4F0]'
                  : 'border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] text-[#5C5953] dark:text-[#9A968E] hover:text-[#141413]'
              }`}
            >
              <GitCompare className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>Сравнить с исходным планом</span>
            </button>

            {canEdit && resetPreview.willResetCount > 0 && (
              <button
                type="button"
                data-testid="inv-reset-plan-btn"
                onClick={() => setShowResetPreviewModal(true)}
                className="h-9 px-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-300 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Вернуть расчёт по плану ({resetPreview.willResetCount})</span>
              </button>
            )}
          </div>
        </div>

        {/* РАСКРЫВАЮЩАЯСЯ ПАНЕЛЬ РАЗДЕЛА 5: «ИЗМЕНИТЬ ПЛАН ИНВЕСТИЦИЙ» */}
        {showEditInvestmentPlan && canEdit && (
          <div
            data-testid="inv-add-capital-form"
            className="pt-4 border-t border-[#E4E1DA] dark:border-[#282724] space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13.5px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                Редактирование плана собственных инвестиций
              </div>
              <button
                type="button"
                onClick={() => setShowEditInvestmentPlan(false)}
                className="text-xs text-[#5C5953] hover:text-[#141413] cursor-pointer"
              >
                Свернуть
              </button>
            </div>

            {/* Форма добавления нового вложения */}
            <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-3.5 space-y-3">
              <div className="text-xs font-medium text-[#141413] dark:text-[#F5F4F0]">
                Добавить собственные деньги
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
                <label className="space-y-1">
                  <span className="text-[#5C5953] dark:text-[#9A968E]">Дата вложения</span>
                  <input
                    type="date"
                    data-testid="inv-new-cap-date"
                    value={injDateIso}
                    onChange={(e) => setInjDateIso(e.target.value)}
                    className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] font-mono"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#5C5953] dark:text-[#9A968E]">Сумма, млн ₽</span>
                  <input
                    type="number"
                    min={0.1}
                    step={0.5}
                    data-testid="inv-new-cap-amount-mln"
                    value={injAmountMln}
                    onChange={(e) => setInjAmountMln(e.target.value)}
                    className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] font-mono"
                  />
                </label>

                <label className="space-y-1 sm:col-span-2">
                  <span className="text-[#5C5953] dark:text-[#9A968E]">
                    Комментарий или источник финансирования
                  </span>
                  <input
                    type="text"
                    data-testid="inv-new-cap-comment"
                    value={injComment}
                    onChange={(e) => setInjComment(e.target.value)}
                    placeholder="Собственные средства / займ учредителя / кредитная линия"
                    className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514]"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#5C5953] dark:text-[#9A968E]">Статус выполнения</span>
                  <select
                    data-testid="inv-new-cap-status"
                    value={injStatus}
                    onChange={(e) => setInjStatus(e.target.value as OperationPaymentStatus)}
                    className="w-full h-8.5 px-2 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514]"
                  >
                    <option value="Запланировано">Запланировано</option>
                    <option value="Утверждено">Утверждено</option>
                    <option value="Оплачено">Фактически внесено (Оплачено)</option>
                  </select>
                </label>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  data-testid="inv-submit-cap-btn"
                  onClick={handleSubmitCapitalInjection}
                  className="h-8.5 px-4 rounded-lg bg-[#141413] dark:bg-[#F5F4F0] text-white dark:text-[#141413] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Добавить вложение</span>
                </button>
              </div>
            </div>

            {/* Список внесённых и запланированных собственных вложений (редактирование даты, суммы, перенос на месяц, статус «Оплачено», удаление) */}
            {activeCapitalInjections.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-[#5C5953] dark:text-[#9A968E]">
                  Запланированные и фактические вложения ({activeCapitalInjections.length})
                </div>
                <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] divide-y divide-[#E4E1DA] dark:divide-[#282724]">
                  {activeCapitalInjections.map((inj) => {
                    const isFactual = inj.status === 'Оплачено';
                    const isCommitted =
                      inj.status === 'Оплачено' || inj.status === 'Утверждено';
                    const mlnStr = String(
                      Math.round((inj.amountRub / 1_000_000) * 100) / 100
                    );
                    return (
                      <div
                        key={inj.id}
                        data-testid={`cap-injection-row-${inj.id}`}
                        className="p-3 flex flex-wrap items-center justify-between gap-2.5 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
                          <input
                            type="date"
                            aria-label="Дата вложения"
                            value={inj.dateIso}
                            onChange={(e) =>
                              handleInlineUpdateInjection(inj, {
                                dateIso: e.target.value,
                              })
                            }
                            className="h-8 px-2 rounded border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] font-mono"
                          />
                          <div className="inline-flex items-center gap-1">
                            <input
                              type="number"
                              min={0.1}
                              step={0.5}
                              aria-label="Сумма вложения, млн ₽"
                              defaultValue={mlnStr}
                              key={`${inj.id}-${inj.amountRub}`}
                              onBlur={(e) => {
                                const v = Number(e.target.value.replace(',', '.'));
                                if (Number.isFinite(v) && v > 0) {
                                  const nextRub = Math.round(v * 1_000_000);
                                  if (nextRub !== inj.amountRub) {
                                    handleInlineUpdateInjection(inj, {
                                      amountRub: nextRub,
                                    });
                                  }
                                }
                              }}
                              className="w-20 h-8 px-2 rounded border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] font-mono text-right"
                            />
                            <span className="text-[#5C5953]">млн ₽</span>
                          </div>
                          <input
                            type="text"
                            aria-label="Источник финансирования"
                            defaultValue={inj.sourceComment || inj.title}
                            key={`${inj.id}-${inj.sourceComment || ''}`}
                            onBlur={(e) => {
                              const nextComment = e.target.value.trim();
                              if (nextComment !== (inj.sourceComment || inj.title)) {
                                handleInlineUpdateInjection(inj, {
                                  sourceComment: nextComment,
                                  title: nextComment || inj.title,
                                });
                              }
                            }}
                            placeholder="Источник финансирования / комментарий"
                            className="flex-1 min-w-[160px] h-8 px-2.5 rounded border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514]"
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              handleInlineUpdateInjection(inj, {
                                dateIso: shiftCapitalInjectionOneMonth(inj.dateIso),
                              })
                            }
                            className="h-7.5 px-2.5 rounded border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] hover:border-[#141413] text-[11.5px] font-medium cursor-pointer"
                          >
                            +1 мес.
                          </button>

                          <button
                            type="button"
                            data-testid={`cap-inj-toggle-paid-${inj.id}`}
                            onClick={() =>
                              handleInlineUpdateInjection(inj, {
                                status: isFactual ? 'Запланировано' : 'Оплачено',
                              })
                            }
                            className={`h-7.5 px-2.5 rounded border text-[11.5px] font-medium cursor-pointer inline-flex items-center gap-1 ${
                              isFactual
                                ? 'bg-emerald-500/12 border-emerald-500/30 text-[#15803D] dark:text-emerald-400'
                                : 'border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] text-[#5C5953] hover:text-[#141413]'
                            }`}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            <span>{isFactual ? 'Выполнено (Оплачено)' : 'Отметить выполненным'}</span>
                          </button>

                          {isCommitted && confirmDeleteCommittedInjId !== inj.id ? (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteCommittedInjId(inj.id)}
                              className="h-7.5 px-2 rounded border border-[#E4E1DA] text-[#5C5953] hover:text-[#B91C1C] cursor-pointer"
                              title="Удалить вложение"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              data-testid={`cap-inj-delete-${inj.id}`}
                              onClick={() => {
                                removeCapitalInjection(
                                  inj.id,
                                  inj.sourceComment || inj.title,
                                  authorName
                                );
                                setConfirmDeleteCommittedInjId(null);
                              }}
                              className="h-7.5 px-2.5 rounded border border-rose-500/30 bg-rose-500/10 text-[#B91C1C] text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>{isCommitted ? 'Подтвердить удаление' : 'Удалить'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Исходные параметры расчётного счёта, резерва и выплат WB */}
            <div className="pt-3 border-t border-[#E4E1DA] dark:border-[#282724] grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <label className="flex items-center justify-between gap-2 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] px-3 py-2">
                <span className="text-[#5C5953] dark:text-[#9A968E]">Начальный остаток на счёте:</span>
                <div className="inline-flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    data-testid="inv-initial-capital-input"
                    value={initialCashMlnValue}
                    onChange={(e) => {
                      const val = Math.max(0, Number(e.target.value) || 0);
                      updateGlobalSettings(
                        { initialCashRub: Math.round(val * 1_000_000) },
                        authorName
                      );
                    }}
                    className="w-18 h-7 px-2 rounded border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] font-mono text-right"
                  />
                  <span className="text-[#5C5953]">млн ₽</span>
                </div>
              </label>

              <label className="flex items-center justify-between gap-2 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] px-3 py-2">
                <span className="text-[#5C5953] dark:text-[#9A968E]">Неснижаемый резерв:</span>
                <div className="inline-flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    data-testid="inv-min-reserve-input"
                    value={reserveMlnValue}
                    onChange={(e) => {
                      const val = Math.max(0, Number(e.target.value) || 0);
                      updateGlobalSettings(
                        { minCashReserveRub: Math.round(val * 1_000_000) },
                        authorName
                      );
                    }}
                    className="w-18 h-7 px-2 rounded border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] font-mono text-right"
                  />
                  <span className="text-[#5C5953]">млн ₽</span>
                </div>
              </label>

              <label className="flex items-center justify-between gap-2 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] px-3 py-2">
                <span className="text-[#5C5953] dark:text-[#9A968E]">Поступления от WB:</span>
                <select
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
                          wbPayoutDelayDays: Number(v),
                        },
                        authorName
                      );
                    }
                  }}
                  className="h-7 px-2 rounded border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] font-mono"
                >
                  <option value="0">В мес. выкупа (7 дн.)</option>
                  <option value="14">Через 14 дней</option>
                  <option value="21">Через 21 день</option>
                  <option value="30">Через 30 дней</option>
                  <option value="45">Через 45 дней</option>
                  <option value="60">Через 60 дней</option>
                  <option value="unset">Не указан</option>
                </select>
              </label>
            </div>
          </div>
        )}

        {/* РАСКРЫВАЮЩАЯСЯ ПАНЕЛЬ РАЗДЕЛА 9: «СРАВНИТЬ С ИСХОДНЫМ ПЛАНОМ» */}
        {showBaselineComparison && (
          <div
            data-testid="fin-baseline-comparison-panel"
            className="pt-4 border-t border-[#E4E1DA] dark:border-[#282724] space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[13.5px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                Сравнение с исходным автоматическим планом
              </div>
              <span className="text-xs text-[#5C5953] dark:text-[#9A968E]">
                {planComparison.summaryVerdictRu}
              </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-[#E4E1DA] dark:border-[#282724]">
              <table className="w-full min-w-[560px] border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-[#FAF9F6] dark:bg-[#1D1C1A] border-b border-[#E4E1DA] dark:border-[#282724] text-[11px] uppercase tracking-wider text-[#5C5953]">
                    <th className="py-2 px-3 font-medium">Показатель</th>
                    <th className="py-2 px-3 font-medium text-right">Исходный план</th>
                    <th className="py-2 px-3 font-medium text-right">Текущий план</th>
                    <th className="py-2 px-3 font-medium text-right">Изменение</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E1DA] dark:divide-[#282724]">
                  <tr>
                    <td className="py-2.5 px-3 font-medium">Стоимость закупок</td>
                    <td className="py-2.5 px-3 text-right font-mono">{fmtMln(planComparison.autoProcurementRub)}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold">{fmtMln(planComparison.currentProcurementRub)}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{fmtSignedDeltaMln(planComparison.deltaProcurementRub)}</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium">Расчётная потребность в своих деньгах</td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {planComparison.autoCalculatedNeedRub !== null ? fmtMln(planComparison.autoCalculatedNeedRub) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold">
                      {planComparison.currentCalculatedNeedRub !== null ? fmtMln(planComparison.currentCalculatedNeedRub) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {planComparison.deltaCalculatedNeedRub !== null ? fmtSignedDeltaMln(planComparison.deltaCalculatedNeedRub) : '—'}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium">Оставшаяся сумма финансирования</td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {planComparison.autoRemainingNeedRub !== null ? fmtMln(planComparison.autoRemainingNeedRub) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold">
                      {planComparison.currentRemainingNeedRub !== null ? fmtMln(planComparison.currentRemainingNeedRub) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {planComparison.deltaRemainingNeedRub !== null ? fmtSignedDeltaMln(planComparison.deltaRemainingNeedRub) : '—'}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium">Обеспеченность товаром (дефицит)</td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {planComparison.autoDeficitPacks.toLocaleString('ru-RU')} ед.
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold">
                      {planComparison.currentDeficitPacks.toLocaleString('ru-RU')} ед.
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-[#B91C1C]">
                      {planComparison.deltaDeficitPacks > 0
                        ? `+${planComparison.deltaDeficitPacks.toLocaleString('ru-RU')} ед. риска`
                        : 'Без дефицита'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ПРЕДУПРЕЖДЕНИЕ О РИСКЕ ДЕФИЦИТА ТОВАРА ПРИ ПЕРЕНОСЕ ПЛАТЕЖА ИЛИ ИЗМЕНЕНИИ ПАРТИИ (РАЗДЕЛ 6 ТЗ) */}
      {schedule.supplyDeficitWarnings.length > 0 && (
        <div
          data-testid="fin-supply-deficit-banner"
          className="rounded-xl border border-rose-500/35 bg-rose-500/8 p-4 space-y-2"
        >
          {schedule.supplyDeficitWarnings.map((sw) => (
            <div
              key={sw.batchKey}
              className="flex flex-wrap items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-start gap-2 text-[#B91C1C] dark:text-rose-300">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Риск нехватки товара: </span>
                  <span>{sw.message}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleJumpToProcurementBatch(sw.modelId)}
                className="h-7.5 px-3 rounded-lg bg-white dark:bg-[#151514] border border-rose-500/35 text-[#B91C1C] dark:text-rose-300 text-[11.5px] font-medium cursor-pointer shrink-0"
              >
                Открыть закупку →
              </button>
            </div>
          ))}
        </div>
      )}

      {/* РАЗДЕЛ 4 И РАЗДЕЛ 6 ТЗ: ГЛАВНЫЙ РАБОЧИЙ БЛОК — «КОГДА И СКОЛЬКО ВЛОЖИТЬ» */}
      <div
        id="when-and-how-much-anchor"
        className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-4 sm:p-5 shadow-[0_1px_2px_rgba(20,20,19,0.04)] space-y-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[15.5px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
              Когда и сколько вложить
            </h3>
            <p className="text-xs text-[#5C5953] dark:text-[#9A968E]">
              Даты финансирования закупочных партий. Раскройте строку («Подробнее»), чтобы посмотреть конкретные партии, перенести оплату или перейти в «Закупки».
            </p>
          </div>

          {allFactoryPaymentEvents.length > 0 && (
            <button
              type="button"
              data-testid="btn-toggle-all-factory-payments"
              onClick={() => setShowAllFactoryPayments((v) => !v)}
              className="h-8 px-3 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] hover:border-[#141413] text-xs font-medium text-[#141413] dark:text-[#F5F4F0] cursor-pointer transition-colors"
            >
              {showAllFactoryPayments
                ? 'Только даты вложений'
                : `Все платежи фабрикам (${allFactoryPaymentEvents.length})`}
            </button>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg border border-[#E4E1DA] dark:border-[#282724]">
          <table
            data-testid="when-and-how-much-table"
            className="w-full min-w-[640px] border-collapse text-left text-xs"
          >
            <thead>
              <tr className="bg-[#FAF9F6] dark:bg-[#1D1C1A] border-b border-[#E4E1DA] dark:border-[#282724] text-[11px] uppercase tracking-wider text-[#5C5953] dark:text-[#9A968E]">
                <th className="py-2.5 px-3.5 font-medium">Дата</th>
                <th className="py-2.5 px-3.5 font-medium">Нужно вложить</th>
                <th className="py-2.5 px-3.5 font-medium">На что нужны деньги</th>
                <th className="py-2.5 px-3.5 font-medium text-right">Действие</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E1DA] dark:divide-[#282724]">
              {schedule.whenAndHowMuchRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 px-4 text-center text-[#5C5953] dark:text-[#9A968E]">
                    {!schedule.wbPayoutScheduleSpecified
                      ? 'Укажите срок поступлений от Wildberries в разделе «Изменить план инвестиций», чтобы рассчитать точные даты вложений.'
                      : 'Все плановые закупочные платежи покрываются текущими средствами и поступлениями от продаж.'}
                  </td>
                </tr>
              ) : (
                schedule.whenAndHowMuchRows.map((row) => {
                  const isExp = expandedWhenDates.has(row.dateIso);
                  return (
                    <React.Fragment key={row.dateIso}>
                      <tr
                        data-testid={`when-row-${row.dateIso}`}
                        onClick={() => toggleWhenRow(row.dateIso)}
                        className="hover:bg-[#FAF9F6] dark:hover:bg-[#1D1C1A] cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-3.5 font-mono font-semibold text-[#141413] dark:text-[#F5F4F0]">
                          {row.dateDotRu}
                        </td>
                        <td className="py-3 px-3.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[13.5px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                              {fmtMln(row.calculatedNeedRub)}
                            </span>
                            {row.coveredByOwnMoneyRub > 0 && (
                              <span
                                className={`px-1.5 py-0.5 rounded font-mono text-[10.5px] font-medium ${
                                  row.isFullyCoveredByOwnMoney
                                    ? 'bg-emerald-500/12 text-[#15803D] dark:text-emerald-400'
                                    : 'bg-amber-500/12 text-amber-800 dark:text-amber-300'
                                }`}
                              >
                                {row.isFullyCoveredByOwnMoney
                                  ? 'Закрыто вложением'
                                  : `Осталось: ${fmtMln(row.remainingNeedRub)}`}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3.5 text-[#141413] dark:text-[#F5F4F0]">
                          <span>{row.purposeLabel}</span>
                          {row.batchesCount > 0 && (
                            <span className="ml-1.5 text-[#5C5953] dark:text-[#9A968E]">
                              ({row.batchesCount} парт.)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-right">
                          <button
                            type="button"
                            data-testid={`when-row-toggle-${row.dateIso}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleWhenRow(row.dateIso);
                            }}
                            className="h-7.5 px-3 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] hover:border-[#141413] text-xs font-medium text-[#141413] dark:text-[#F5F4F0] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>{isExp ? 'Свернуть' : 'Подробнее'}</span>
                            {isExp ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* Раскрытая детализация платежей фабрикам — строго все 7 полей Раздела 4 ТЗ + действия Раздела 6 */}
                      {isExp && (
                        <tr>
                          <td
                            colSpan={4}
                            className="bg-[#FAF9F6]/80 dark:bg-[#191816] px-3.5 py-3.5"
                          >
                            <div className="overflow-x-auto rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514]">
                              <table className="w-full min-w-[780px] border-collapse text-left text-[11.5px]">
                                <thead>
                                  <tr className="border-b border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] text-[10.5px] uppercase tracking-wider text-[#5C5953]">
                                    <th className="py-2 px-3 font-medium">Название товара</th>
                                    <th className="py-2 px-2.5 font-medium">Номер партии</th>
                                    <th className="py-2 px-2.5 font-medium">Фабрика</th>
                                    <th className="py-2 px-2.5 font-medium">Дата платежа</th>
                                    <th className="py-2 px-2.5 font-medium text-right">Сумма</th>
                                    <th className="py-2 px-2.5 font-medium">Этап оплаты</th>
                                    <th className="py-2 px-2.5 font-medium">Поступление товара</th>
                                    <th className="py-2 px-3 font-medium text-right">Управление</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#E4E1DA] dark:divide-[#282724]">
                                  {row.factoryPayments.map((fp) => (
                                    <tr
                                      key={fp.opKey}
                                      data-testid={`factory-payment-item-${fp.opKey}`}
                                      className="hover:bg-[#FAF9F6] dark:hover:bg-[#1D1C1A]"
                                    >
                                      <td className="py-2.5 px-3">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleJumpToProcurementBatch(
                                              fp.modelId,
                                              fp.event.brandCode === 'ALL'
                                                ? undefined
                                                : fp.event.brandCode
                                            )
                                          }
                                          className="text-left font-medium text-[#141413] dark:text-[#F5F4F0] hover:underline cursor-pointer"
                                          title="Перейти к соответствующему заказу в разделе «Закупки»"
                                        >
                                          {fp.productTitle}
                                        </button>
                                      </td>
                                      <td className="py-2.5 px-2.5">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleJumpToProcurementBatch(
                                              fp.modelId,
                                              fp.event.brandCode === 'ALL'
                                                ? undefined
                                                : fp.event.brandCode
                                            )
                                          }
                                          className="font-mono text-[#141413] dark:text-[#F5F4F0] hover:underline cursor-pointer inline-flex items-center gap-1"
                                        >
                                          <span>{fp.batchNumber}</span>
                                          <ArrowUpRight className="h-3 w-3 text-[#5C5953]" />
                                        </button>
                                        <div className="text-[10.5px] text-[#5C5953]">
                                          {fp.packsQty.toLocaleString('ru-RU')} {fp.unitLabel}
                                        </div>
                                      </td>
                                      <td className="py-2.5 px-2.5 text-[#5C5953] dark:text-[#9A968E]">
                                        {fp.factoryName}
                                      </td>
                                      <td className="py-2.5 px-2.5 font-mono">
                                        {fp.paymentDateDotRu}
                                        {fp.hasManualOverride && (
                                          <span className="ml-1 px-1 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[9.5px]">
                                            изм.
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2.5 px-2.5 text-right font-mono font-semibold text-[#141413] dark:text-[#F5F4F0]">
                                        {fmtMln(fp.amountRub)}
                                      </td>
                                      <td className="py-2.5 px-2.5">
                                        <div>{fp.paymentStageLabel}</div>
                                        <span className="text-[10px] text-[#5C5953]">
                                          {fp.status}
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-2.5 font-mono text-[#5C5953] dark:text-[#9A968E]">
                                        {fp.arrivalDateDotRu}
                                      </td>
                                      <td className="py-2.5 px-3 text-right">
                                        <div className="inline-flex flex-wrap items-center justify-end gap-1">
                                          {canEdit && !fp.isApprovedLocked && (
                                            <button
                                              type="button"
                                              data-testid={`quick-shift-next-month-${fp.opKey}`}
                                              onClick={() =>
                                                handleQuickShiftFactoryPaymentNextMonth(fp.event)
                                              }
                                              className="h-7 px-2 rounded border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] hover:border-[#141413] text-[11px] font-medium cursor-pointer"
                                              title="Перенести плановый платёж на следующий месяц"
                                            >
                                              На след. мес.
                                            </button>
                                          )}
                                          <button
                                            type="button"
                                            data-testid={`open-payment-editor-${fp.opKey}`}
                                            onClick={() => setSelectedOpId(fp.event.id)}
                                            className="h-7 px-2.5 rounded border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] hover:border-[#141413] text-[11px] font-medium text-[#141413] dark:text-[#F5F4F0] cursor-pointer"
                                          >
                                            Изменить
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Режим просмотра всех плановых платежей фабрикам (включая оплаченные из реинвестирования) */}
        {showAllFactoryPayments && allFactoryPaymentEvents.length > 0 && (
          <div className="pt-2 space-y-2">
            <div className="text-xs font-medium text-[#5C5953] dark:text-[#9A968E]">
              Все платежи фабрикам по календарю периода ({allFactoryPaymentEvents.length})
            </div>
            <div className="overflow-x-auto max-h-80 rounded-lg border border-[#E4E1DA] dark:border-[#282724]">
              <table className="w-full min-w-[720px] border-collapse text-left text-[11.5px]">
                <thead className="sticky top-0 bg-[#FAF9F6] dark:bg-[#1D1C1A] border-b border-[#E4E1DA] dark:border-[#282724] text-[10.5px] uppercase text-[#5C5953]">
                  <tr>
                    <th className="py-2 px-3 font-medium">Дата</th>
                    <th className="py-2 px-3 font-medium">Партия и товар</th>
                    <th className="py-2 px-2.5 font-medium">Фабрика</th>
                    <th className="py-2 px-2.5 font-medium text-right">Сумма</th>
                    <th className="py-2 px-2.5 font-medium text-right">Из продаж WB</th>
                    <th className="py-2 px-3 font-medium text-right">Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E1DA] dark:divide-[#282724]">
                  {allFactoryPaymentEvents.map((ev) => (
                    <tr
                      key={ev.id}
                      className="hover:bg-[#FAF9F6] dark:hover:bg-[#1D1C1A]"
                    >
                      <td className="py-2 px-3 font-mono">{formatIsoDateDotRu(ev.dateIso)}</td>
                      <td className="py-2 px-3">
                        <div className="font-medium text-[#141413] dark:text-[#F5F4F0]">
                          {ev.title}
                        </div>
                        <div className="text-[10.5px] text-[#5C5953]">
                          {ev.status}
                          {ev.batchDetails
                            ? ` · поступление ${formatIsoDateDotRu(ev.batchDetails.arrivalDateIso)}`
                            : ''}
                        </div>
                      </td>
                      <td className="py-2 px-2.5 text-[#5C5953]">{ev.factoryName || '—'}</td>
                      <td className="py-2 px-2.5 text-right font-mono font-semibold">
                        {fmtMln(ev.amountRub)}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono text-[#15803D]">
                        {ev.reinvestedFromSalesRub > 0
                          ? fmtMln(ev.reinvestedFromSalesRub)
                          : '—'}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedOpId(ev.id)}
                          className="h-7 px-2.5 rounded border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] hover:border-[#141413] text-[11px] font-medium cursor-pointer"
                        >
                          Изменить условия
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* РАЗДЕЛ 6 ТЗ: ИНСПЕКТОР УПРАВЛЕНИЯ ЗАКУПОЧНЫМ ПЛАТЕЖОМ И ПАРТИЕЙ */}
      {selectedEvent && (
        <div
          data-testid="inv-operation-inspector"
          className="rounded-xl border border-[#141413] dark:border-[#5C5953] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-4 sm:p-5 space-y-4 shadow-[0_2px_10px_rgba(20,20,19,0.06)]"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-[#141413] text-white font-mono text-[10.5px] font-semibold uppercase">
                  Управление закупочным платежом
                </span>
                {selectedEvent.isApprovedLocked && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-[#15803D] font-mono text-[10.5px] font-semibold">
                    <Lock className="h-3 w-3" />
                    <span>Утверждённый заказ ({selectedEvent.status})</span>
                  </span>
                )}
              </div>
              <h4 className="mt-1.5 text-[15px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                {selectedEvent.title}
              </h4>
            </div>

            <div className="flex items-center gap-2">
              {selectedEvent.batchDetails && (
                <button
                  type="button"
                  onClick={() =>
                    handleJumpToProcurementBatch(
                      selectedEvent.batchDetails!.modelId,
                      selectedEvent.brandCode === 'ALL'
                        ? undefined
                        : selectedEvent.brandCode
                    )
                  }
                  className="h-8 px-3 rounded-lg bg-[#141413] dark:bg-[#F5F4F0] text-white dark:text-[#141413] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Перейти к закупочной партии</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedOpId(null)}
                className="h-8 w-8 rounded-lg border border-[#E4E1DA] bg-white dark:bg-[#151514] text-[#5C5953] inline-flex items-center justify-center cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Защита утверждённых заказов фабрикам без отдельного подтверждения (Раздел 6 и 11) */}
          {canEdit && selectedEvent.isApprovedLocked && !lockedEditConfirmed && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950 dark:text-amber-200">
              <span>
                Утверждённый заказ фабрике защищён от случайного изменения. Подтвердите ручную корректировку с записью в историю изменений.
              </span>
              <button
                type="button"
                data-testid="inv-unlock-approved-btn"
                onClick={() => setLockedEditConfirmed(true)}
                className="h-7.5 px-3 rounded-lg bg-[#141413] text-white font-medium inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Unlock className="h-3 w-3" />
                <span>Подтвердить корректировку</span>
              </button>
            </div>
          )}

          {canEdit && (!selectedEvent.isApprovedLocked || lockedEditConfirmed) && (
            <div className="space-y-3.5 pt-2 border-t border-[#E4E1DA] dark:border-[#282724] text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <label className="space-y-1">
                  <span className="text-[#5C5953]">Дата оплаты</span>
                  <input
                    type="date"
                    data-testid="inv-edit-payment-date"
                    value={editDateIso}
                    onChange={(e) => setEditDateIso(e.target.value)}
                    className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] font-mono"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#5C5953]">Сумма платежа, ₽</span>
                  <input
                    type="number"
                    min={0}
                    step={10000}
                    data-testid="inv-edit-payment-amount"
                    value={editAmountRub}
                    onChange={(e) => setEditAmountRub(e.target.value)}
                    className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] font-mono"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#5C5953]">Фабрика / поставщик</span>
                  <input
                    type="text"
                    value={editSupplier}
                    onChange={(e) => setEditSupplier(e.target.value)}
                    className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514]"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#5C5953]">Статус операции</span>
                  <select
                    data-testid="inv-edit-payment-status"
                    value={editStatus}
                    onChange={(e) =>
                      setEditStatus(e.target.value as OperationPaymentStatus)
                    }
                    className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514]"
                  >
                    <option value="Запланировано">Запланировано</option>
                    <option value="Утверждено">Утверждено</option>
                    <option value="Оплачено">Оплачено</option>
                  </select>
                </label>
              </div>

              {selectedEvent.batchDetails && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                  <label className="space-y-1">
                    <span className="text-[#5C5953]">Предоплата фабрике, %</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={5}
                      data-testid="inv-edit-prepay-pct"
                      value={editPrepayPct}
                      onChange={(e) => setEditPrepayPct(e.target.value)}
                      className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] font-mono"
                    />
                  </label>

                  {pairedBalanceEvent && (
                    <label className="space-y-1">
                      <span className="text-[#5C5953]">Дата окончательного платежа</span>
                      <input
                        type="date"
                        data-testid="inv-edit-balance-date"
                        value={editBalanceDateIso}
                        onChange={(e) => setEditBalanceDateIso(e.target.value)}
                        className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] font-mono"
                      />
                    </label>
                  )}

                  <label className="space-y-1">
                    <span className="text-[#5C5953]">
                      Объём плановой партии ({selectedEvent.batchDetails.primaryUnitLabel})
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={50}
                      data-testid="inv-edit-packs-qty"
                      value={editPacksQty}
                      onChange={(e) => setEditPacksQty(e.target.value)}
                      className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] font-mono"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[#5C5953]">Дата поступления на склад</span>
                    <input
                      type="date"
                      data-testid="inv-edit-arrival-date"
                      value={editArrivalDateIso}
                      onChange={(e) => setEditArrivalDateIso(e.target.value)}
                      className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] font-mono"
                    />
                  </label>
                </div>
              )}

              {/* Быстрые действия: Перенести на следующий месяц + Разделить платёж на несколько частей */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    data-testid="inv-move-next-month-btn"
                    onClick={() =>
                      setEditDateIso(
                        shiftIsoDateToNextMonth(
                          editDateIso || selectedEvent.dateIso,
                          schedule.scenarioYear
                        )
                      )
                    }
                    className="h-8 px-3 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] hover:border-[#141413] font-medium cursor-pointer"
                  >
                    Перенести на следующий месяц
                  </button>

                  <button
                    type="button"
                    onClick={() => setSplitModeOpen((v) => !v)}
                    className="h-8 px-3 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] hover:border-[#141413] font-medium inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Split className="h-3.5 w-3.5" />
                    <span>
                      {splitModeOpen ? 'Скрыть разделение' : 'Разделить платёж на части'}
                    </span>
                  </button>

                  {selectedEvent.hasManualOverride && (
                    <button
                      type="button"
                      data-testid="inv-undo-single-btn"
                      onClick={() => {
                        undoOperationOverride({
                          opKey: selectedEvent.opKey,
                          batchKey: selectedEvent.batchKey,
                          scenarioScopeKey: selectedEvent.scenarioScopeKey,
                          operationTitle: selectedEvent.title,
                          author: authorName,
                        });
                        setSelectedOpId(null);
                      }}
                      className="h-8 px-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-300 font-medium inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Отменить ручную корректировку</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  data-testid="inv-save-op-btn"
                  onClick={handleSaveSelectedPaymentInspector}
                  className="h-8.5 px-4 rounded-lg bg-[#141413] dark:bg-[#F5F4F0] text-white dark:text-[#141413] font-medium cursor-pointer"
                >
                  Сохранить изменения
                </button>
              </div>

              {/* Режим разбиения платежа на несколько частей */}
              {splitModeOpen && (
                <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Разделение платежа на части</span>
                    <button
                      type="button"
                      onClick={() =>
                        setSplitDrafts((prev) => [
                          ...prev,
                          {
                            id: `tr-${prev.length + 1}`,
                            dateIso: addDaysToIsoDate(
                              prev[prev.length - 1]?.dateIso || selectedEvent.dateIso,
                              14
                            ),
                            amountRub: 0,
                            label: `Часть ${prev.length + 1}`,
                            status: editStatus,
                          },
                        ])
                      }
                      className="text-xs font-medium text-[#15803D] hover:underline cursor-pointer"
                    >
                      + Добавить часть
                    </button>
                  </div>
                  <div className="space-y-2">
                    {splitDrafts.map((tr, idx) => (
                      <div key={tr.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
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
                          className="sm:col-span-4 h-8 px-2.5 rounded border border-[#E4E1DA] bg-[#FAF9F6] dark:bg-[#1D1C1A]"
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
                          className="sm:col-span-4 h-8 px-2.5 rounded border border-[#E4E1DA] bg-[#FAF9F6] dark:bg-[#1D1C1A] font-mono"
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
                                  ? { ...x, amountRub: Math.max(0, Number(e.target.value) || 0) }
                                  : x
                              )
                            )
                          }
                          className="sm:col-span-3 h-8 px-2.5 rounded border border-[#E4E1DA] bg-[#FAF9F6] dark:bg-[#1D1C1A] font-mono text-right"
                        />
                        {splitDrafts.length > 2 && (
                          <button
                            type="button"
                            onClick={() =>
                              setSplitDrafts((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="sm:col-span-1 text-[#B91C1C] inline-flex justify-center cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* РАЗДЕЛ 8 ТЗ: ОДИН ОСНОВНОЙ ГРАФИК — «СВОБОДНЫЕ ДЕНЬГИ БИЗНЕСА» */}
      <div
        data-testid="business-free-cash-chart"
        className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-4 sm:p-5 shadow-[0_1px_2px_rgba(20,20,19,0.04)] space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-[15.5px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
              Свободные деньги бизнеса · {selectedYear}
            </h3>
            <p className="text-xs text-[#5C5953] dark:text-[#9A968E]">
              Выше нуля — деньги доступны после обязательных платежей и с учётом резерва. Ниже нуля — требуется финансирование. Нажмите на месяц для раскрытия операций.
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-[#5C5953] dark:text-[#9A968E]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-[#15803D]" />
              <span>Свободные средства (&gt; 0)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-[#B91C1C]" />
              <span>Требуется финансирование (&lt; 0)</span>
            </span>
          </div>
        </div>

        {/* Столбчатый график по 12 месяцам с нулевой осью */}
        <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-3.5 sm:p-4">
          <div className="grid grid-cols-12 gap-1.5 sm:gap-2.5">
            {schedule.monthlyCalendarRows.map((mRow) => {
              const val = mRow.businessFreeCashRub;
              const isPos = val >= 0;
              const ratioPct = Math.min(
                100,
                Math.max(val === 0 ? 3 : 8, Math.round((Math.abs(val) / maxAbsFreeCash) * 100))
              );
              const isSel = selectedFreeCashMonthIdx === mRow.monthIdx;
              const shortMln =
                Math.abs(val) < 50_000
                  ? '0'
                  : `${val < 0 ? '−' : '+'}${(Math.abs(val) / 1_000_000)
                      .toFixed(1)
                      .replace('.', ',')}`;

              return (
                <button
                  key={mRow.monthIdx}
                  type="button"
                  data-testid={`free-cash-bar-${mRow.monthIdx}`}
                  onClick={() =>
                    setSelectedFreeCashMonthIdx((prev) =>
                      prev === mRow.monthIdx ? null : mRow.monthIdx
                    )
                  }
                  className={`group rounded-lg p-1.5 flex flex-col items-center cursor-pointer transition-colors ${
                    isSel
                      ? 'bg-white dark:bg-[#151514] ring-1 ring-[#141413] dark:ring-[#F5F4F0]'
                      : 'hover:bg-white/70 dark:hover:bg-[#151514]/70'
                  }`}
                >
                  <span
                    className={`font-mono text-[10px] font-medium tabular-nums mb-1 ${
                      isPos
                        ? 'text-[#15803D] dark:text-emerald-400'
                        : 'text-[#B91C1C] dark:text-rose-400 font-semibold'
                    }`}
                  >
                    {shortMln}
                  </span>

                  {/* Верхняя полуплоскость (> 0) */}
                  <div className="w-full h-16 flex items-end justify-center">
                    {isPos && (
                      <div
                        style={{ height: `${ratioPct}%` }}
                        className="w-full max-w-[26px] rounded-t bg-[#15803D] dark:bg-emerald-500 transition-all"
                      />
                    )}
                  </div>

                  {/* Линия 0 ₽ */}
                  <div className="w-full h-px bg-[#78746C]/60" />

                  {/* Нижняя полуплоскость (< 0) */}
                  <div className="w-full h-16 flex items-start justify-center">
                    {!isPos && (
                      <div
                        style={{ height: `${ratioPct}%` }}
                        className="w-full max-w-[26px] rounded-b bg-[#B91C1C] dark:bg-rose-500 transition-all"
                      />
                    )}
                  </div>

                  <span
                    className={`mt-1.5 text-[11px] font-medium ${
                      isSel
                        ? 'text-[#141413] dark:text-[#F5F4F0] font-semibold'
                        : 'text-[#5C5953] dark:text-[#9A968E]'
                    }`}
                  >
                    {mRow.shortMonthLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Раскрытие выбранного месяца: поступления, платежи, собственные вложения и остаток + операции */}
        {selectedFreeCashRow && (
          <div
            data-testid="free-cash-month-detail"
            className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13.5px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                {selectedFreeCashRow.periodLabel} — движение денег
              </div>
              <button
                type="button"
                onClick={() => setSelectedFreeCashMonthIdx(null)}
                className="text-xs text-[#5C5953] hover:text-[#141413] cursor-pointer"
              >
                Закрыть
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-3">
                <div className="text-[#5C5953]">Поступления</div>
                <div className="mt-1 font-mono text-sm font-semibold text-[#15803D]">
                  +{fmtMln(selectedFreeCashRow.inflowsRub)}
                </div>
              </div>
              <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-3">
                <div className="text-[#5C5953]">Платежи</div>
                <div className="mt-1 font-mono text-sm font-semibold text-[#141413] dark:text-[#F5F4F0]">
                  −{fmtMln(selectedFreeCashRow.outflowsRub)}
                </div>
              </div>
              <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-3">
                <div className="text-[#5C5953]">Собственные вложения</div>
                <div className="mt-1 font-mono text-sm font-semibold text-[#141413] dark:text-[#F5F4F0]">
                  {selectedFreeCashRow.userCapitalInjectionsRub > 0
                    ? `+${fmtMln(selectedFreeCashRow.userCapitalInjectionsRub)}`
                    : '0,00 млн ₽'}
                </div>
              </div>
              <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-3">
                <div className="text-[#5C5953]">Остаток (свободные деньги)</div>
                <div
                  className={`mt-1 font-mono text-sm font-semibold ${
                    selectedFreeCashRow.businessFreeCashRub >= 0
                      ? 'text-[#15803D]'
                      : 'text-[#B91C1C]'
                  }`}
                >
                  {fmtMln(selectedFreeCashRow.businessFreeCashRub)}
                </div>
              </div>
            </div>

            {selectedFreeCashRow.events.length > 0 && (
              <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] divide-y divide-[#E4E1DA] dark:divide-[#282724] max-h-60 overflow-y-auto text-xs">
                {selectedFreeCashRow.events.map((ev) => (
                  <div
                    key={ev.id}
                    onClick={() => {
                      if (ev.type === 'factory_payment' || ev.type === 'other_expense') {
                        setSelectedOpId(ev.id);
                      }
                    }}
                    className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 hover:bg-[#FAF9F6] dark:hover:bg-[#1D1C1A] cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[#5C5953] shrink-0">
                        {formatIsoDateDotRu(ev.dateIso)}
                      </span>
                      <span className="truncate font-medium text-[#141413] dark:text-[#F5F4F0]">
                        {ev.title}
                      </span>
                    </div>
                    <span
                      className={`font-mono font-semibold shrink-0 ${
                        ev.inflowRub > 0 || ev.userCapitalInjectionRub > 0
                          ? 'text-[#15803D]'
                          : 'text-[#141413] dark:text-[#F5F4F0]'
                      }`}
                    >
                      {ev.inflowRub > 0
                        ? `+${fmtMln(ev.inflowRub)}`
                        : ev.userCapitalInjectionRub > 0
                        ? `+${fmtMln(ev.userCapitalInjectionRub)}`
                        : `−${fmtMln(ev.outflowRub)}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ЖУРНАЛ ИСТОРИИ ИЗМЕНЕНИЙ (РАЗДЕЛ 11 ТЗ) */}
      {showHistoryDrawer && (
        <div className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[14px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
              История изменений плана инвестиций и платежей ({ledgerState.auditHistory.length})
            </div>
            <button
              type="button"
              onClick={() => setShowHistoryDrawer(false)}
              className="text-xs text-[#5C5953] hover:text-[#141413] cursor-pointer"
            >
              Закрыть
            </button>
          </div>
          {ledgerState.auditHistory.length === 0 ? (
            <p className="text-xs text-[#5C5953]">Ручных изменений пока не вносилось.</p>
          ) : (
            <div className="max-h-60 overflow-y-auto divide-y divide-[#E4E1DA] dark:divide-[#282724] border border-[#E4E1DA] dark:border-[#282724] rounded-lg text-xs">
              {ledgerState.auditHistory.map((h) => (
                <div key={h.id} className="p-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-[#141413] dark:text-[#F5F4F0]">
                      {h.operationTitle}
                    </div>
                    <div className="text-[#5C5953]">
                      {h.beforeValue} → <strong className="text-[#141413] dark:text-[#F5F4F0]">{h.afterValue}</strong>
                    </div>
                  </div>
                  <div className="font-mono text-[10.5px] text-[#5C5953]">
                    {new Date(h.timestampIso).toLocaleString('ru-RU')} · {h.author}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* РАЗДЕЛЫ 3 И 8 ТЗ: СКРЫТЫЙ ПО УМОЛЧАНИЮ РАЗДЕЛ «ПОДРОБНАЯ АНАЛИТИКА» */}
      <div className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] overflow-hidden">
        <button
          type="button"
          data-testid="btn-toggle-detailed-analytics"
          onClick={() => setShowDetailedAnalytics((v) => !v)}
          className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[#FAF9F6] dark:hover:bg-[#1D1C1A] cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <BarChart3 className="h-4 w-4 text-[#5C5953]" strokeWidth={1.5} />
            <div>
              <div className="text-[13.5px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                Подробная аналитика
              </div>
              <div className="text-xs text-[#5C5953] dark:text-[#9A968E]">
                Помесячная таблица движения денег, операционные расходы, рентабельность и дополнительные показатели
              </div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#141413] dark:text-[#F5F4F0]">
            <span>{showDetailedAnalytics ? 'Свернуть' : 'Открыть'}</span>
            {showDetailedAnalytics ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
        </button>

        {showDetailedAnalytics && (
          <div className="p-5 border-t border-[#E4E1DA] dark:border-[#282724] space-y-6">
            {/* Управление дополнительными расходами (реклама, логистика, ФОТ) */}
            {canEdit && (
              <div id="fin-custom-expenses-anchor" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[13.5px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                    Дополнительные денежные операции (реклама, логистика, ФОТ и прочие расходы)
                  </div>
                  <button
                    type="button"
                    data-testid="inv-add-expense-btn"
                    onClick={() => setShowAddOperationForm((v) => !v)}
                    className="h-8 px-3 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Добавить плановую операцию</span>
                  </button>
                </div>

                {showAddOperationForm && (
                  <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 text-xs items-end">
                    <label className="space-y-1">
                      <span className="text-[#5C5953]">Тип</span>
                      <select
                        value={opKind}
                        onChange={(e) => setOpKind(e.target.value as 'expense' | 'inflow')}
                        className="w-full h-8 px-2 rounded border border-[#E4E1DA] bg-white dark:bg-[#151514]"
                      >
                        <option value="expense">Расход</option>
                        <option value="inflow">Поступление</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[#5C5953]">Категория</span>
                      <select
                        value={opCategory}
                        onChange={(e) =>
                          setOpCategory(e.target.value as CustomCashOperationRecord['category'])
                        }
                        className="w-full h-8 px-2 rounded border border-[#E4E1DA] bg-white dark:bg-[#151514]"
                      >
                        <option value="opex">Операционные / ФОТ</option>
                        <option value="marketing_ext">Реклама</option>
                        <option value="logistics_customs">Логистика</option>
                        <option value="tax">Налоги</option>
                        <option value="factory_extra">Доп. платёж фабрике</option>
                        <option value="other_inflow">Прочее поступление</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[#5C5953]">Дата</span>
                      <input
                        type="date"
                        value={opDateIso}
                        onChange={(e) => setOpDateIso(e.target.value)}
                        className="w-full h-8 px-2 rounded border border-[#E4E1DA] bg-white dark:bg-[#151514] font-mono"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[#5C5953]">Сумма, млн ₽</span>
                      <input
                        type="number"
                        min={0.05}
                        step={0.1}
                        value={opAmountMln}
                        onChange={(e) => setOpAmountMln(e.target.value)}
                        className="w-full h-8 px-2 rounded border border-[#E4E1DA] bg-white dark:bg-[#151514] font-mono"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[#5C5953]">Назначение</span>
                      <input
                        type="text"
                        value={opTitle}
                        onChange={(e) => setOpTitle(e.target.value)}
                        className="w-full h-8 px-2 rounded border border-[#E4E1DA] bg-white dark:bg-[#151514]"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const mln = Number(String(opAmountMln).replace(',', '.'));
                        if (!Number.isFinite(mln) || mln <= 0) return;
                        saveCustomCashOperation(
                          {
                            id: `op-${Date.now()}`,
                            dateIso: opDateIso,
                            amountRub: Math.round(mln * 1_000_000),
                            kind: opKind,
                            category: opCategory,
                            title: opTitle.trim() || 'Плановая операция',
                            factoryName: opSupplier.trim() || undefined,
                            linkedBatchKey: opBatchKey || undefined,
                            status: opStatus,
                          },
                          schedule.activeScopeKey,
                          authorName
                        );
                        setShowAddOperationForm(false);
                      }}
                      className="h-8 px-3 rounded bg-[#141413] text-white font-medium cursor-pointer"
                    >
                      Сохранить
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Полная помесячная таблица календаря движения денег */}
            <div className="space-y-2">
              <div className="text-[13.5px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                Помесячный календарь движения денег · {selectedYear}
              </div>
              <div className="overflow-x-auto rounded-lg border border-[#E4E1DA] dark:border-[#282724]">
                <table
                  data-testid="investment-calendar-table"
                  className="w-full min-w-[760px] border-collapse text-left text-xs"
                >
                  <thead>
                    <tr className="bg-[#FAF9F6] dark:bg-[#1D1C1A] border-b border-[#E4E1DA] dark:border-[#282724] text-[11px] uppercase text-[#5C5953]">
                      <th className="py-2.5 px-3 font-medium">Период</th>
                      <th className="py-2.5 px-3 font-medium text-right">Поступления</th>
                      <th className="py-2.5 px-3 font-medium text-right">Платежи</th>
                      <th className="py-2.5 px-3 font-medium text-right">Реинвестирование</th>
                      <th className="py-2.5 px-3 font-medium text-right">Нужно вложить</th>
                      <th className="py-2.5 px-3 font-medium text-right">Остаток</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E1DA] dark:divide-[#282724]">
                    {schedule.monthlyCalendarRows.map((mRow) => {
                      const isOpen = expandedMonths.has(mRow.monthIdx);
                      return (
                        <React.Fragment key={mRow.monthIdx}>
                          <tr
                            data-testid={`inv-month-row-${mRow.monthIdx}`}
                            onClick={() => toggleMonthExpand(mRow.monthIdx)}
                            className="hover:bg-[#FAF9F6] dark:hover:bg-[#1D1C1A] cursor-pointer"
                          >
                            <td className="py-2.5 px-3 font-medium inline-flex items-center gap-1.5">
                              {isOpen ? (
                                <ChevronDown className="h-3.5 w-3.5 text-[#5C5953]" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-[#5C5953]" />
                              )}
                              <span>{mRow.periodLabel}</span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-[#15803D]">
                              {mRow.inflowsRub > 0 ? `+${fmtMln(mRow.inflowsRub)}` : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              {mRow.outflowsRub > 0 ? `−${fmtMln(mRow.outflowsRub)}` : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-[#15803D]">
                              {mRow.reinvestedRub > 0 ? fmtMln(mRow.reinvestedRub) : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#B91C1C]">
                              {mRow.needToInvestRub > 0 ? fmtMln(mRow.needToInvestRub) : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              {fmtMln(mRow.endingFreeCashRub)}
                            </td>
                          </tr>
                          {isOpen &&
                            mRow.events.map((ev) => (
                              <tr
                                key={ev.id}
                                data-testid={`inv-event-row-${ev.type}`}
                                onClick={() => setSelectedOpId(ev.id)}
                                className="bg-[#FAF9F6]/60 dark:bg-[#191816] text-[11.5px] cursor-pointer"
                              >
                                <td className="py-2 pl-8 pr-3 font-mono text-[#5C5953]">
                                  {formatIsoDateDotRu(ev.dateIso)} · {ev.title}
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-[#15803D]">
                                  {ev.inflowRub > 0 ? `+${fmtMln(ev.inflowRub)}` : '—'}
                                </td>
                                <td className="py-2 px-3 text-right font-mono">
                                  {ev.outflowRub > 0 ? `−${fmtMln(ev.outflowRub)}` : '—'}
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-[#15803D]">
                                  {ev.reinvestedFromSalesRub > 0
                                    ? fmtMln(ev.reinvestedFromSalesRub)
                                    : '—'}
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-[#B91C1C]">
                                  {ev.needToInvestRub > 0 ? fmtMln(ev.needToInvestRub) : '—'}
                                </td>
                                <td className="py-2 px-3 text-right font-mono">
                                  {ev.type === 'other_expense' || ev.type === 'other_inflow' ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeCustomCashOperation(ev.id, ev.title, authorName);
                                      }}
                                      className="text-[#B91C1C] hover:underline cursor-pointer"
                                    >
                                      Удалить
                                    </button>
                                  ) : (
                                    fmtMln(ev.closingFreeCashRub)
                                  )}
                                </td>
                              </tr>
                            ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Дополнительные графики, P&L, ROI и симуляторы, переданные родительским экраном */}
            {extraDetailedAnalyticsSlot}
          </div>
        )}
      </div>

      {/* МОДАЛЬНОЕ ОКНО ПОДТВЕРЖДЕНИЯ ВОЗВРАТА К АВТОМАТИЧЕСКОМУ ПЛАНУ (С ЗАЩИТОЙ УТВЕРЖДЁННЫХ ЗАКАЗОВ) */}
      {showResetPreviewModal && (
        <div className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div
            data-testid="inv-reset-preview-modal"
            className="w-full max-w-xl rounded-xl border border-[#E4E1DA] bg-white p-5 space-y-4 text-xs shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-[#141413]">
                  Предпросмотр возврата к исходному автоматическому плану
                </h4>
                <p className="text-[#5C5953] mt-0.5">
                  Плановые ручные корректировки выбранного сценария будут сброшены к автоматическому расчёту.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowResetPreviewModal(false)}
                className="h-7 w-7 rounded-lg border border-[#E4E1DA] inline-flex items-center justify-center cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/25 p-3 flex items-center gap-2 text-[#15803D]">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                Утверждённые заказы фабрикам (<strong>«Утверждено»</strong>) и фактические операции (<strong>«Оплачено»</strong>) защищены и перезаписаны не будут ({resetPreview.preservedLockedCount} опер.).
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
        className="w-full max-w-6xl my-4 bg-[#FAF9F6] dark:bg-[#111110] rounded-2xl border border-[#E4E1DA] dark:border-[#282724] p-4 sm:p-6 shadow-2xl"
      >
        <InvestmentSchedulePanel {...rest} isModal onCloseModal={onClose} />
      </div>
    </div>
  );
}
