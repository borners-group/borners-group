'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  GitCompare,
  History,
  Layers,
  Lock,
  Plus,
  RotateCcw,
  ShieldAlert,
  Split,
  Trash2,
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
  type CompatibleUnitBreakdownRow,
  type CustomCashOperationRecord,
  type DraftPaymentOrBatchEditPatch,
  type GroupCapitalMode,
  type OperationPaymentStatus,
  type PaymentOrBatchEditPreviewResult,
  type PaymentTrancheSpec,
  type SystemActionRecommendation,
  type WhenAndHowMuchFactoryPaymentItem,
  addDaysToIsoDate,
  formatIsoDateDotRu,
  formatIsoDateHumanRu,
} from '@/lib/investmentScheduleEngine';
import { useInvestmentSchedule } from '@/lib/useInvestmentSchedule';

function splitMoneyParts(
  valRub: number,
  opts?: { signed?: boolean; approx?: boolean }
): { sign: string; num: string; unit: string } {
  const abs = Math.abs(valRub);
  const approxPrefix = opts?.approx ? '~' : '';
  if (abs === 0) {
    return { sign: approxPrefix, num: '0,00', unit: 'млн ₽' };
  }
  const rawSign = valRub < 0 ? '−' : opts?.signed && valRub > 0 ? '+' : '';
  if (abs < 100_000) {
    const intStr = String(Math.round(abs)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return { sign: `${approxPrefix}${rawSign}`, num: intStr, unit: '₽' };
  }
  const [intPart, decPart] = (abs / 1_000_000).toFixed(2).split('.');
  const groupedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return {
    sign: `${approxPrefix}${rawSign}`,
    num: `${groupedInt},${decPart}`,
    unit: 'млн ₽',
  };
}

function fmtMln(valRub: number): string {
  const { sign, num, unit } = splitMoneyParts(valRub);
  return `${sign}${num} ${unit}`;
}

function fmtSignedDeltaMln(valRub: number): string {
  if (Math.abs(valRub) < 1_000) return '0 ₽';
  const { sign, num, unit } = splitMoneyParts(valRub, { signed: true });
  return `${sign}${num} ${unit}`;
}

function fmtRub(valRub: number): string {
  const sign = valRub < 0 ? '−' : '';
  const intStr = String(Math.round(Math.abs(valRub))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${intStr} ₽`;
}

function MoneyFigure({
  valueRub,
  className = '',
  unitClassName = '',
  signed = false,
  approx = false,
  title,
}: {
  valueRub: number;
  className?: string;
  unitClassName?: string;
  signed?: boolean;
  approx?: boolean;
  title?: string;
}) {
  const { sign, num, unit } = splitMoneyParts(valueRub, { signed, approx });
  return (
    <span
      title={title}
      className={`font-display-num tabular-nums whitespace-nowrap inline-flex items-baseline ${className}`}
    >
      <span>
        {sign}
        {num}
      </span>
      <span
        className={`text-[0.54em] font-medium text-[#7A766E] dark:text-[#8E8A82] ml-1 whitespace-nowrap tracking-normal ${unitClassName}`}
      >
        {unit}
      </span>
    </span>
  );
}

const BRAND_DOT_STYLE: Record<
  string,
  {
    dotClass: string;
    activeDotClass: string;
    monogramBg: string;
    monogramText: string;
    monogramBorder: string;
  }
> = {
  BORNERS_FUKAI: {
    dotClass: 'bg-[#1C1B18] dark:bg-[#E5E2DC]',
    activeDotClass: 'bg-white/90',
    monogramBg: 'bg-[#F3F1EC] dark:bg-[#23221F]',
    monogramText: 'text-[#1C1B18] dark:text-[#E5E2DC]',
    monogramBorder: 'border-[#E2DED5] dark:border-[#34322E]',
  },
  BORNERS: {
    dotClass: 'bg-[#1C1B18] dark:bg-[#E5E2DC]',
    activeDotClass: 'bg-white/90',
    monogramBg: 'bg-[#F3F1EC] dark:bg-[#23221F]',
    monogramText: 'text-[#1C1B18] dark:text-[#E5E2DC]',
    monogramBorder: 'border-[#E2DED5] dark:border-[#34322E]',
  },
  FUKAI: {
    dotClass: 'bg-[#1C1B18] dark:bg-[#E5E2DC]',
    activeDotClass: 'bg-white/90',
    monogramBg: 'bg-[#F3F1EC] dark:bg-[#23221F]',
    monogramText: 'text-[#1C1B18] dark:text-[#E5E2DC]',
    monogramBorder: 'border-[#E2DED5] dark:border-[#34322E]',
  },
  AKUSHA: {
    dotClass: 'bg-[#D95D39]',
    activeDotClass: 'bg-[#EE7754]',
    monogramBg: 'bg-[#FDF1EC] dark:bg-[#2C1C17]',
    monogramText: 'text-[#B84523] dark:text-[#F09A7E]',
    monogramBorder: 'border-[#F3D4C8] dark:border-[#4A2D23]',
  },
  LISKANI: {
    dotClass: 'bg-[#0F766E]',
    activeDotClass: 'bg-[#2DD4BF]',
    monogramBg: 'bg-[#ECF6F5] dark:bg-[#142927]',
    monogramText: 'text-[#0F766E] dark:text-[#5EEAD4]',
    monogramBorder: 'border-[#CBE6E3] dark:border-[#224542]',
  },
  NA_TELE: {
    dotClass: 'bg-[#B07D4F]',
    activeDotClass: 'bg-[#D6A373]',
    monogramBg: 'bg-[#F9F3EC] dark:bg-[#292119]',
    monogramText: 'text-[#8C6038] dark:text-[#DDB38A]',
    monogramBorder: 'border-[#EADBC9] dark:border-[#433528]',
  },
};

function getBrandVisual(brandCode?: string | null) {
  const key = (brandCode || '').trim().toUpperCase();
  if (key === 'BORNERS / FUKAI' || key === 'BORNERS+FUKAI') {
    return BRAND_DOT_STYLE.BORNERS_FUKAI;
  }
  return BRAND_DOT_STYLE[key] || BRAND_DOT_STYLE.BORNERS_FUKAI;
}

function getBrandShortLabel(brandCode?: string | null): string {
  const key = (brandCode || '').trim().toUpperCase();
  if (key === 'BORNERS_FUKAI' || key === 'BORNERS / FUKAI') return 'BORNERS / FUKAI';
  if (key === 'BORNERS') return 'BORNERS';
  if (key === 'FUKAI') return 'FUKAI';
  if (key === 'AKUSHA') return 'AKUSHA';
  if (key === 'LISKANI') return 'LISKANI';
  if (key === 'NA_TELE') return 'НА ТЕЛЕ';
  return key;
}

function getProductMonogram(title: string, code?: string): string {
  const cleanTitle = (title || '').replace(/[«»"'()[\]]/g, ' ').trim();
  const stopWords = new Set([
    'и',
    'в',
    'на',
    'с',
    'для',
    'по',
    'из',
    'от',
    'к',
    'комплект',
    'набор',
  ]);
  const words = cleanTitle
    .split(/[\s\-_/]+/)
    .filter((w) => w.length > 0 && !stopWords.has(w.toLowerCase()));
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  if (words.length === 1 && words[0].length >= 2) {
    return words[0].slice(0, 2).toUpperCase();
  }
  const cleanCode = (code || '').replace(/[^A-Za-zА-Яа-я0-9]/g, '');
  if (cleanCode.length >= 2) return cleanCode.slice(0, 2).toUpperCase();
  return 'SK';
}

function pluralizeBatchesRu(count: number): string {
  const n = Math.abs(Math.round(count)) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return `${count} партий`;
  if (n1 === 1) return `${count} партия`;
  if (n1 >= 2 && n1 <= 4) return `${count} партии`;
  return `${count} партий`;
}

function getCompatibleUnitShortDisplay(row: CompatibleUnitBreakdownRow): {
  categoryName: string;
  shortUnit: string;
} {
  if (row.unitCategory === 'pairs') {
    return { categoryName: 'Обувь', shortUnit: 'пар' };
  }
  if (row.unitCategory === 'curtains') {
    return { categoryName: 'Шторы', shortUnit: 'компл.' };
  }
  if (row.unitCategory === 'sets') {
    return { categoryName: 'Бельё', shortUnit: 'компл.' };
  }
  return { categoryName: 'Товары', shortUnit: 'шт.' };
}

function SkuPaymentThumbnail({
  src,
  alt,
  code,
  brandCode,
}: {
  src?: string;
  alt: string;
  code?: string;
  brandCode?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [src]);

  if (src && !imgFailed) {
    return (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setImgFailed(true)}
        className="h-12 w-12 rounded-xl object-cover ring-1 ring-black/[0.08] dark:ring-white/[0.1] bg-[#FAF9F6] dark:bg-[#1D1C1A] shrink-0"
      />
    );
  }

  const brandVis = getBrandVisual(brandCode);
  const initials = getProductMonogram(alt, code);

  return (
    <div
      aria-label={`SKU ${code || alt}`}
      className={`h-12 w-12 rounded-xl border shrink-0 flex flex-col items-center justify-center text-center px-1 select-none ${brandVis.monogramBg} ${brandVis.monogramBorder} ${brandVis.monogramText}`}
    >
      <span className="text-[12.5px] font-semibold tracking-tight leading-none">
        {initials}
      </span>
      {code && (
        <span className="mt-1 font-mono text-[8px] opacity-65 truncate max-w-full leading-none">
          {code.slice(0, 6)}
        </span>
      )}
    </div>
  );
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
  selectedScenarioByBrand?: Partial<
    Record<CanonicalBrandCode | 'BORNERS_FUKAI' | 'LISCANI', number | null>
  >;
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
    groupCapitalMode,
    setGroupCapitalMode,
    previewEdit,
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
  const [amountManuallyEdited, setAmountManuallyEdited] = useState(false);
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
    if (!selectedOpId || typeof window === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedOpId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedOpId]);

  useEffect(() => {
    if (!selectedEvent) return;
    setEditDateIso(selectedEvent.dateIso);
    setEditAmountRub(String(selectedEvent.amountRub));
    setAmountManuallyEdited(false);
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

  const parsedDraftPrepayPct = useMemo(() => {
    const bd = selectedEvent?.batchDetails;
    if (!bd) return undefined;
    if (editPrepayPct.trim() === '') return bd.prepaymentPct;
    const n = Number(editPrepayPct);
    if (!Number.isFinite(n)) return bd.prepaymentPct;
    return Math.max(0, Math.min(100, Math.round(n)));
  }, [selectedEvent, editPrepayPct]);

  const parsedDraftPacksQty = useMemo(() => {
    const bd = selectedEvent?.batchDetails;
    if (!bd) return undefined;
    if (editPacksQty.trim() === '') return bd.packsQty;
    const n = Number(editPacksQty);
    if (!Number.isFinite(n)) return bd.packsQty;
    return Math.max(0, Math.round(n));
  }, [selectedEvent, editPacksQty]);

  const draftEditPatch = useMemo<DraftPaymentOrBatchEditPatch | null>(() => {
    if (!selectedEvent) return null;
    const bd = selectedEvent.batchDetails;
    const bKey = selectedEvent.batchKey;
    const isPrepay = selectedEvent.paymentRole === 'prepay';
    const isBalance = selectedEvent.paymentRole === 'balance';
    const cleanAmount = Math.max(0, Math.round(Number(editAmountRub) || 0));

    const pctChanged =
      bd !== undefined &&
      parsedDraftPrepayPct !== undefined &&
      parsedDraftPrepayPct !== bd.prepaymentPct;
    const packsChanged =
      bd !== undefined &&
      editPacksQty.trim() !== '' &&
      parsedDraftPacksQty !== undefined &&
      parsedDraftPacksQty !== bd.packsQty;
    const arrivalChanged =
      bd !== undefined &&
      Boolean(editArrivalDateIso) &&
      editArrivalDateIso !== bd.arrivalDateIso;
    const supplierChanged =
      Boolean(editSupplier.trim()) &&
      editSupplier.trim() !== (selectedEvent.factoryName || bd?.factoryName || '');
    const dateChanged = Boolean(editDateIso) && editDateIso !== selectedEvent.dateIso;
    const statusChanged = editStatus !== selectedEvent.status;
    const balanceDateChanged = Boolean(
      pairedBalanceEvent &&
        pairedBalanceEvent.opKey !== selectedEvent.opKey &&
        editBalanceDateIso &&
        editBalanceDateIso !== pairedBalanceEvent.dateIso
    );

    const batchOverride: DraftPaymentOrBatchEditPatch['batchOverride'] =
      bd && (pctChanged || packsChanged || arrivalChanged || supplierChanged)
        ? {
            ...(pctChanged ? { customPrepaymentPct: parsedDraftPrepayPct } : {}),
            ...(packsChanged ? { customPacksQty: parsedDraftPacksQty } : {}),
            ...(arrivalChanged ? { customArrivalDateIso: editArrivalDateIso } : {}),
            ...(supplierChanged ? { customFactoryName: editSupplier.trim() } : {}),
          }
        : undefined;

    if (bd && bKey && isBalance) {
      const prepayOverride: DraftPaymentOrBatchEditPatch['paymentOverride'] = pctChanged
        ? { depositPct: parsedDraftPrepayPct, customAmountRub: undefined }
        : packsChanged
        ? { depositPct: undefined, customAmountRub: undefined }
        : undefined;
      const balanceOverride: DraftPaymentOrBatchEditPatch['balancePaymentOverride'] = {
        ...(dateChanged ? { customDateIso: editDateIso } : {}),
        ...(amountManuallyEdited && !pctChanged && !packsChanged
          ? { customAmountRub: cleanAmount }
          : pctChanged || packsChanged
          ? { customAmountRub: undefined }
          : {}),
        ...(supplierChanged ? { customFactoryName: editSupplier.trim() } : {}),
        ...(statusChanged ? { status: editStatus } : {}),
        ...(splitModeOpen ? { splitTranches: splitDrafts } : {}),
      };
      return {
        scenarioScopeKey: selectedEvent.scenarioScopeKey,
        batchKey: bKey,
        opKey: `${bKey}::prepay`,
        isApprovedPo: Boolean(bd.isApprovedPo),
        batchOverride,
        paymentOverride: prepayOverride,
        balancePaymentOverride: balanceOverride,
      };
    }

    const paymentOverride: DraftPaymentOrBatchEditPatch['paymentOverride'] = {
      ...(dateChanged ? { customDateIso: editDateIso } : {}),
      ...(isPrepay && pctChanged
        ? { depositPct: parsedDraftPrepayPct, customAmountRub: undefined }
        : amountManuallyEdited && !packsChanged
        ? { customAmountRub: cleanAmount, depositPct: undefined }
        : packsChanged
        ? { customAmountRub: undefined, depositPct: undefined }
        : {}),
      ...(supplierChanged ? { customFactoryName: editSupplier.trim() } : {}),
      ...(statusChanged ? { status: editStatus } : {}),
      ...(splitModeOpen ? { splitTranches: splitDrafts } : {}),
      ...(balanceDateChanged ? { balanceDateIso: editBalanceDateIso } : {}),
    };

    const balancePaymentOverride: DraftPaymentOrBatchEditPatch['balancePaymentOverride'] =
      balanceDateChanged || pctChanged || packsChanged || (isPrepay && amountManuallyEdited)
        ? {
            ...(balanceDateChanged ? { customDateIso: editBalanceDateIso } : {}),
            ...(pctChanged || packsChanged || (isPrepay && amountManuallyEdited)
              ? { customAmountRub: undefined }
              : {}),
          }
        : undefined;

    return {
      scenarioScopeKey: selectedEvent.scenarioScopeKey,
      batchKey: bKey,
      opKey: selectedEvent.opKey,
      isApprovedPo: Boolean(bd?.isApprovedPo),
      batchOverride,
      paymentOverride,
      balancePaymentOverride,
    };
  }, [
    selectedEvent,
    editDateIso,
    editAmountRub,
    amountManuallyEdited,
    editSupplier,
    editStatus,
    parsedDraftPrepayPct,
    parsedDraftPacksQty,
    editPacksQty,
    editArrivalDateIso,
    editBalanceDateIso,
    pairedBalanceEvent,
    splitModeOpen,
    splitDrafts,
  ]);

  const liveEditPreview: PaymentOrBatchEditPreviewResult | null = useMemo(() => {
    if (!selectedEvent || !draftEditPatch) return null;
    return previewEdit(draftEditPatch);
  }, [selectedEvent, draftEditPatch, previewEdit]);

  const nextRequiredCashRow = useMemo(() => {
    return (
      schedule.whenAndHowMuchRows.find((r) => r.remainingNeedRub > 0) ||
      schedule.whenAndHowMuchRows[0] ||
      null
    );
  }, [schedule.whenAndHowMuchRows]);

  const secondaryRecommendations = useMemo(() => {
    return schedule.recommendations.filter((rec) => {
      if (rec.actionTarget === 'focus_payment_date' && nextRequiredCashRow) return false;
      if (
        (rec.actionTarget === 'open_missing_cost_sku' ||
          rec.actionTarget === 'open_investment_settings') &&
        (schedule.isPreliminaryCalculation || !schedule.isProfitComplete)
      ) {
        return false;
      }
      if (rec.severity === 'success' && (nextRequiredCashRow || schedule.nextUpcomingPayment)) {
        return false;
      }
      return true;
    });
  }, [
    schedule.recommendations,
    schedule.isPreliminaryCalculation,
    schedule.isProfitComplete,
    schedule.nextUpcomingPayment,
    nextRequiredCashRow,
  ]);

  // Данные для графика «Свободные деньги бизнеса» (Раздел 8) — объявлено до раннего return по правилам React Hooks
  const maxAbsFreeCash = useMemo(() => {
    let m = 1_000_000;
    for (const row of schedule.monthlyCalendarRows) {
      m = Math.max(m, Math.abs(row.businessFreeCashRub));
    }
    return m;
  }, [schedule.monthlyCalendarRows]);

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
    brandCode?: CanonicalBrandCode | 'BORNERS_FUKAI' | string,
    meta?: { batchKey?: string; modelCode?: string; dateIso?: string }
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

    if (typeof window !== 'undefined') {
      const focusDetail = {
        modelId,
        brandCode: resolvedBrandCode,
        batchKey: meta?.batchKey || '',
        modelCode: meta?.modelCode || '',
        dateIso: meta?.dateIso || '',
      };
      try {
        window.sessionStorage.setItem(
          'borners_focus_procurement_batch',
          JSON.stringify(focusDetail)
        );
        window.localStorage.setItem('borners_procurement_subtab_v1', 'batches');
        window.localStorage.setItem('borners_procurement_selected_sku_v1', modelId);
        window.sessionStorage.setItem('borners_focus_procurement_sku_id', modelId);
      } catch {
        // ignore
      }
      window.dispatchEvent(
        new CustomEvent('borners-open-procurement-batch', { detail: focusDetail })
      );
    }

    if (onOpenBatchInProcurement) {
      onOpenBatchInProcurement(modelId, resolvedBrandCode);
      if (onCloseModal) onCloseModal();
      return;
    }
    navigateTo('roadmap-tasks', resolvedBrandCode ? { brandId: resolvedBrandCode } : undefined);
    if (onCloseModal) onCloseModal();
  };

  const handleFocusWhenDate = (dateIso?: string | null) => {
    const targetIso = dateIso || nextRequiredCashRow?.dateIso || null;
    if (targetIso) {
      setExpandedWhenDates((prev) => new Set(prev).add(targetIso));
    }
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      window.requestAnimationFrame(() => {
        const targetEl =
          (targetIso
            ? document.querySelector(`[data-testid="when-row-${targetIso}"]`)
            : null) || document.getElementById('when-and-how-much-anchor');
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }
  };

  const handleOpenWhatToFill = () => {
    const firstMissingModelId =
      schedule.missingCostModelIds[0] ||
      schedule.incompleteDataReasons.find((r) => r.modelId)?.modelId;
    if (firstMissingModelId) {
      if (onOpenMissingCostSku) {
        onOpenMissingCostSku(
          firstMissingModelId,
          normBrand === 'ALL' ? undefined : normBrand
        );
        if (onCloseModal) onCloseModal();
        return;
      }
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem(
            'borners_focus_procurement_sku_id',
            firstMissingModelId
          );
          window.localStorage.setItem(
            'borners_procurement_selected_sku_v1',
            firstMissingModelId
          );
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
    setShowEditInvestmentPlan(true);
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      window.requestAnimationFrame(() => {
        const el = document.querySelector('[data-testid="inv-wb-delay-select"]');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  };

  const handleRecommendationAction = (rec: SystemActionRecommendation) => {
    if (rec.actionTarget === 'focus_payment_date') {
      handleFocusWhenDate(rec.targetDateIso);
      return;
    }
    if (rec.actionTarget === 'open_procurement') {
      if (rec.modelId) {
        handleJumpToProcurementBatch(
          rec.modelId,
          normBrand === 'ALL' ? undefined : normBrand,
          { batchKey: rec.batchKey }
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
    if (!canEdit || ev.isApprovedLocked || ev.isFactual) {
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

  const handleEditPrepayPctChange = (nextVal: string) => {
    setEditPrepayPct(nextVal);
    setAmountManuallyEdited(false);
    const bd = selectedEvent?.batchDetails;
    if (!bd) return;
    const parsedPct = nextVal.trim() === '' ? NaN : Number(nextVal);
    const parsedPacks =
      editPacksQty.trim() === '' ? bd.packsQty : Number(editPacksQty);
    if (!Number.isFinite(parsedPct) || !Number.isFinite(parsedPacks)) return;
    const clampedPct = Math.max(0, Math.min(100, Math.round(parsedPct)));
    const cleanPacks = Math.max(0, Math.round(parsedPacks));
    const unitCost =
      bd.unitCostRub > 0
        ? bd.unitCostRub
        : bd.packsQty > 0
        ? bd.totalBatchCostRub / bd.packsQty
        : 0;
    const totalBatchRub = Math.round(cleanPacks * unitCost);
    const nextPrepayRub = Math.round((totalBatchRub * clampedPct) / 100);
    const nextBalanceRub = Math.max(0, totalBatchRub - nextPrepayRub);
    if (selectedEvent?.paymentRole === 'prepay') {
      setEditAmountRub(String(nextPrepayRub));
    } else if (selectedEvent?.paymentRole === 'balance') {
      setEditAmountRub(String(nextBalanceRub));
    }
  };

  const handleEditPacksQtyChange = (nextVal: string) => {
    setEditPacksQty(nextVal);
    setAmountManuallyEdited(false);
    const bd = selectedEvent?.batchDetails;
    if (!bd) return;
    const parsedPacks = nextVal.trim() === '' ? NaN : Number(nextVal);
    const parsedPct =
      editPrepayPct.trim() === '' ? bd.prepaymentPct : Number(editPrepayPct);
    if (!Number.isFinite(parsedPacks) || !Number.isFinite(parsedPct)) return;
    const cleanPacks = Math.max(0, Math.round(parsedPacks));
    const clampedPct = Math.max(0, Math.min(100, Math.round(parsedPct)));
    const unitCost =
      bd.unitCostRub > 0
        ? bd.unitCostRub
        : bd.packsQty > 0
        ? bd.totalBatchCostRub / bd.packsQty
        : 0;
    const totalBatchRub = Math.round(cleanPacks * unitCost);
    const nextPrepayRub = Math.round((totalBatchRub * clampedPct) / 100);
    const nextBalanceRub = Math.max(0, totalBatchRub - nextPrepayRub);
    if (selectedEvent?.paymentRole === 'prepay') {
      setEditAmountRub(String(nextPrepayRub));
    } else if (selectedEvent?.paymentRole === 'balance') {
      setEditAmountRub(String(nextBalanceRub));
    }
  };

  const handleSaveSelectedPaymentInspector = () => {
    if (!selectedEvent || !canEdit) return;
    // Фактический платёж («Оплачено») защищён от перезаписи (Стр. 6 и 10 ТЗ v1.0)
    if (selectedEvent.status === 'Оплачено' || selectedEvent.isFactual) return;
    // Перенос / правка согласованного заказа требует явного подтверждения чекбоксом
    const requiresApprovedConfirm = Boolean(
      selectedEvent.batchDetails?.isApprovedPo || selectedEvent.isApprovedLocked
    );
    if (requiresApprovedConfirm && !lockedEditConfirmed) return;

    const bd = selectedEvent.batchDetails;
    const isPrepay = selectedEvent.paymentRole === 'prepay';
    const isBalance = selectedEvent.paymentRole === 'balance';
    const cleanAmount = Math.max(
      0,
      Math.round(Number(editAmountRub) || selectedEvent.amountRub)
    );
    const pctNum = parsedDraftPrepayPct ?? bd?.prepaymentPct ?? 30;
    const packsNum = parsedDraftPacksQty ?? bd?.packsQty ?? 0;
    const pctChanged = Boolean(bd && pctNum !== bd.prepaymentPct);
    const arrivalChanged = Boolean(
      bd && editArrivalDateIso && editArrivalDateIso !== bd.arrivalDateIso
    );
    const supplierChanged = Boolean(
      editSupplier.trim() &&
        editSupplier.trim() !== (selectedEvent.factoryName || bd?.factoryName || '')
    );
    const packsChanged = Boolean(
      bd && editPacksQty.trim() !== '' && packsNum !== bd.packsQty
    );

    updatePaymentOperation({
      opKey: selectedEvent.opKey,
      batchKey: selectedEvent.batchKey || '',
      scenarioScopeKey: selectedEvent.scenarioScopeKey,
      isApprovedPo: Boolean(bd?.isApprovedPo),
      currentTitle: selectedEvent.title,
      beforeSummary: `${formatIsoDateHumanRu(selectedEvent.dateIso)} · ${fmtRub(selectedEvent.amountRub)} (${selectedEvent.status})`,
      patch: {
        customDateIso: editDateIso || selectedEvent.dateIso,
        ...(isPrepay && pctChanged
          ? { depositPct: pctNum, customAmountRub: undefined }
          : amountManuallyEdited && !pctChanged && !packsChanged
          ? {
              customAmountRub:
                cleanAmount !== selectedEvent.autoAmountRub ? cleanAmount : undefined,
              depositPct: undefined,
            }
          : packsChanged || (isBalance && pctChanged)
          ? { customAmountRub: undefined }
          : {}),
        customFactoryName: editSupplier.trim() || undefined,
        status: editStatus,
        splitTranches: splitModeOpen ? splitDrafts : undefined,
        ...(pairedBalanceEvent &&
        pairedBalanceEvent.opKey !== selectedEvent.opKey &&
        editBalanceDateIso &&
        editBalanceDateIso !== pairedBalanceEvent.dateIso
          ? { balanceDateIso: editBalanceDateIso }
          : {}),
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

    // Раздел 6: Изменение предоплаты (%), поставщика, объёма или срока поставки партии
    if (bd && selectedEvent.batchKey) {
      if (pctChanged || arrivalChanged || supplierChanged || packsChanged) {
        updateBatchTerms({
          batchKey: selectedEvent.batchKey,
          scenarioScopeKey: selectedEvent.scenarioScopeKey,
          isApprovedPo: bd.isApprovedPo,
          batchTitle: `${bd.modelCode} · ${bd.periodId.toUpperCase()}`,
          beforeSummary: `Объём ${bd.packsQty.toLocaleString('ru-RU')} ${bd.primaryUnitLabel}, аванс ${bd.prepaymentPct}%, поставка ${formatIsoDateHumanRu(bd.arrivalDateIso)}`,
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

  const selectedFreeCashRow =
    selectedFreeCashMonthIdx !== null
      ? schedule.monthlyCalendarRows[selectedFreeCashMonthIdx] || null
      : null;

  const resolvedWbDeductionsRub = schedule.totalWbDeductionsRub;
  const resolvedReverseLogisticsRub = schedule.totalReverseLogisticsRub;
  const resolvedTaxRub = schedule.totalTaxRub;
  const resolvedOpexRub = schedule.totalOpexRub;
  const resolvedTaxAndOpexTotalRub =
    resolvedTaxRub + resolvedOpexRub + schedule.totalOtherExpensesRub;
  const resolvedNetWbProceedsRub = Math.max(
    0,
    schedule.totalGrossSalesRevenueRub - resolvedWbDeductionsRub
  );
  const resolvedWbDeductionsPct =
    schedule.totalGrossSalesRevenueRub > 0
      ? Math.round((resolvedWbDeductionsRub / schedule.totalGrossSalesRevenueRub) * 1000) / 10
      : 0;
  const resolvedNetWbProceedsPct =
    schedule.totalGrossSalesRevenueRub > 0
      ? Math.round((resolvedNetWbProceedsRub / schedule.totalGrossSalesRevenueRub) * 1000) / 10
      : 0;
  const resolvedSoldGoodsCostRub = schedule.totalSoldGoodsCostRub;
  const resolvedOperatingProfitRub =
    schedule.expectedOperatingProfitRub - schedule.totalOtherExpensesRub;
  const resolvedOperatingMarginPct =
    schedule.totalOtherExpensesRub === 0
      ? schedule.expectedOperatingMarginPct
      : schedule.totalGrossSalesRevenueRub > 0
      ? Math.round((resolvedOperatingProfitRub / schedule.totalGrossSalesRevenueRub) * 1000) / 10
      : 0;

  const grossRevRub = schedule.totalGrossSalesRevenueRub;
  const wbSharePct =
    grossRevRub > 0
      ? Math.max(0, Math.min(100, Math.round((resolvedWbDeductionsRub / grossRevRub) * 1000) / 10))
      : 0;
  const cogsSharePct =
    grossRevRub > 0
      ? Math.max(0, Math.min(100, Math.round((resolvedSoldGoodsCostRub / grossRevRub) * 1000) / 10))
      : 0;
  const taxOpexSharePct =
    grossRevRub > 0
      ? Math.max(0, Math.min(100, Math.round((resolvedTaxAndOpexTotalRub / grossRevRub) * 1000) / 10))
      : 0;
  const profitPositiveRub = Math.max(0, resolvedOperatingProfitRub);
  const profitSharePct =
    grossRevRub > 0
      ? Math.max(0, Math.min(100, Math.round((profitPositiveRub / grossRevRub) * 1000) / 10))
      : 0;
  const revenueBarSum = wbSharePct + cogsSharePct + taxOpexSharePct + profitSharePct;
  const revenueBarNorm = revenueBarSum > 0 ? 100 / revenueBarSum : 0;
  const barWbWidthPct = wbSharePct * revenueBarNorm;
  const barCogsWidthPct = cogsSharePct * revenueBarNorm;
  const barTaxOpexWidthPct = taxOpexSharePct * revenueBarNorm;
  const barProfitWidthPct = profitSharePct * revenueBarNorm;

  const showPreliminaryNoticeStrip =
    schedule.isPreliminaryCalculation || !schedule.isProfitComplete;

  const requiredCapitalRub = schedule.calculatedCapitalNeedRub ?? 0;
  const factualFundedSharePct =
    requiredCapitalRub > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round((schedule.factualOwnMoneyContributedRub / requiredCapitalRub) * 100)
          )
        )
      : 100;
  const plannedFundedSharePct =
    requiredCapitalRub > 0
      ? Math.min(
          100 - factualFundedSharePct,
          Math.max(
            0,
            Math.round((schedule.plannedOwnMoneyInjectionsRub / requiredCapitalRub) * 100)
          )
        )
      : 0;

  return (
    <div
      data-testid="investment-schedule-root"
      className="space-y-5"
    >
      {/* РАЗДЕЛ 2 ТЗ: ЕДИНАЯ СПОКОЙНАЯ ПАНЕЛЬ ФИЛЬТРОВ (БРЕНД / СЦЕНАРИЙ / ГОД 2027–2028 + СТАТУС) */}
      <div className="rounded-2xl bg-white dark:bg-[#151514] border border-[#141413]/[0.08] dark:border-[#282724] p-2.5 sm:px-3.5 shadow-[0_1px_2px_rgba(20,20,19,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {/* 1. Бренд с фирменными цветными точками */}
            {onSelectBrandFilter && (
              <div
                role="group"
                aria-label="Выбор бренда"
                className="inline-flex flex-wrap items-center gap-0.5 max-w-full rounded-xl bg-[#F3F1EC] dark:bg-[#1D1C1A] p-1 border border-[#141413]/[0.05] dark:border-[#282724]"
              >
                {BRAND_PILLS.map((bp) => {
                  const isAct =
                    bp.code === 'BORNERS_FUKAI'
                      ? normBrand !== 'ALL' && isBornersFukaiScope
                      : normBrand === bp.code;
                  const brandVis = bp.code !== 'ALL' ? getBrandVisual(bp.code) : null;
                  return (
                    <button
                      key={bp.code}
                      type="button"
                      data-testid={`fin-brand-pill-${bp.code}`}
                      onClick={() => handleSelectBrandPill(bp.code)}
                      className={`h-8 px-3 rounded-lg text-[12.5px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all ${
                        isAct
                          ? 'bg-[#141413] text-white shadow-[0_1px_2px_rgba(20,20,19,0.12)]'
                          : 'text-[#5C5953] dark:text-[#9A968E] hover:text-[#141413] dark:hover:text-[#F5F4F0] hover:bg-white/60 dark:hover:bg-white/[0.04]'
                      }`}
                    >
                      {brandVis && (
                        <span
                          aria-hidden="true"
                          className={`h-[7px] w-[7px] rounded-full shrink-0 ${
                            isAct ? brandVis.activeDotClass : brandVis.dotClass
                          }`}
                        />
                      )}
                      <span>{bp.label}</span>
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
                  className="h-9 max-w-[260px] sm:max-w-[330px] truncate px-3 rounded-xl bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] hover:border-[#C8C3B8] text-[12.5px] font-medium text-[#141413] dark:text-[#F5F4F0] transition-colors"
                >
                  {availableBrandScenarios.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.title}
                    </option>
                  ))}
                </select>
              )}

            {normBrand === 'ALL' && (
              <span className="inline-flex items-center h-9 px-3 rounded-xl bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#ECEAE3] dark:border-[#282724] text-[12px] text-[#6B6760] dark:text-[#9A968E] whitespace-nowrap">
                Сводка по сценариям брендов
              </span>
            )}

            {/* 3. Год: 2027 / 2028 */}
            <div
              role="group"
              aria-label="Год расчёта"
              className="inline-flex items-center shrink-0 gap-0.5 rounded-xl bg-[#F3F1EC] dark:bg-[#1D1C1A] p-1 border border-[#141413]/[0.05] dark:border-[#282724]"
            >
              {([2027, 2028] as const).map((yr) => {
                const isYr = selectedYear === yr;
                return (
                  <button
                    key={yr}
                    type="button"
                    data-testid={`fin-year-${yr}`}
                    onClick={() => setSelectedYear(yr, authorName)}
                    className={`h-8 px-3 rounded-lg font-display-num tabular-nums text-[12.5px] font-medium cursor-pointer transition-all ${
                      isYr
                        ? 'bg-[#141413] text-white shadow-[0_1px_2px_rgba(20,20,19,0.12)]'
                        : 'text-[#5C5953] dark:text-[#9A968E] hover:text-[#141413] dark:hover:text-[#F5F4F0]'
                    }`}
                  >
                    {yr}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Правая группа: статус сохранения, защищённые операции, история */}
          <div className="flex flex-wrap items-center gap-1.5">
            {schedule.lockedOperationsCount > 0 && (
              <span
                title={`Утверждённых и фактических операций: ${schedule.lockedOperationsCount}`}
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-[#EAF6F0] dark:bg-emerald-500/12 text-[11.5px] font-display-num font-medium text-[#0F766E] dark:text-emerald-400 whitespace-nowrap"
              >
                <Lock className="h-3 w-3" />
                <span>{schedule.lockedOperationsCount}</span>
              </span>
            )}

            <span
              data-testid="fin-save-status"
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-[#FAF9F6] dark:bg-[#1D1C1A] text-[11.5px] text-[#6B6760] dark:text-[#9A968E] whitespace-nowrap"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  saveStatus === 'saving' ? 'bg-amber-500 animate-pulse' : 'bg-[#0F766E] dark:bg-emerald-400'
                }`}
              />
              <span>
                {saveStatus === 'saving'
                  ? 'Сохранение…'
                  : saveStatus === 'saved_cloud'
                  ? 'Сохранено'
                  : 'Локально'}
              </span>
            </span>

            <button
              type="button"
              data-testid="btn-audit-history"
              onClick={() => setShowHistoryDrawer((v) => !v)}
              className="h-8 px-2.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] hover:bg-[#FAF9F6] dark:hover:bg-[#1D1C1A] text-[#3D3A36] dark:text-[#F5F4F0] text-[12px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
            >
              <History className="h-3.5 w-3.5 text-[#7A766E]" strokeWidth={1.6} />
              <span>История</span>
              <span className="font-display-num tabular-nums text-[#7A766E] dark:text-[#9A968E]">
                {ledgerState.auditHistory.length}
              </span>
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
      </div>

      {/* ЕДИНАЯ СПОКОЙНАЯ ПОЛОСА ПРЕДВАРИТЕЛЬНОГО РАСЧЁТА (ВМЕСТО 6 ДУБЛИРУЮЩИХСЯ ОРАНЖЕВЫХ БАННЕРОВ) */}
      {showPreliminaryNoticeStrip && (
        <div
          data-testid="fin-preliminary-badge"
          title={schedule.incompleteDataReasons.map((r) => r.label).join('; ')}
          className="rounded-xl bg-[#FDF8EE] dark:bg-amber-500/[0.09] border border-[#EED9B3] dark:border-amber-500/25 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 min-w-0 text-[12.5px] text-[#7A4B16] dark:text-amber-200/90">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full bg-[#D97706] shrink-0"
            />
            <p className="leading-snug">
              <span className="font-semibold text-[#5C360D] dark:text-amber-200">
                Предварительный расчёт
              </span>
              <span className="mx-1.5 text-[#C8A66E] dark:text-amber-400/50">·</span>
              <span>
                {!schedule.wbPayoutScheduleSpecified
                  ? 'Укажите срок поступления выручки от Wildberries для расчёта потребности в капитале'
                  : schedule.missingCostModelsCount > 0
                  ? `У ${schedule.missingCostModelsCount} моделей не заполнена себестоимость — они исключены из реинвестирования и прибыли`
                  : schedule.profitIncompleteReason ||
                    schedule.incompleteDataReasons.map((r) => r.label).join('; ') ||
                    'Часть исходных параметров ещё не заполнена'}
              </span>
            </p>
          </div>
          <button
            type="button"
            data-testid="fin-what-to-fill-btn"
            onClick={handleOpenWhatToFill}
            className="h-7.5 px-3 rounded-lg bg-white dark:bg-[#1D1C1A] border border-[#E6C994] dark:border-amber-500/35 hover:border-[#B45309] dark:hover:border-amber-400 text-[12px] font-medium text-[#7A4B16] dark:text-amber-200 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer shadow-[0_1px_1px_rgba(122,75,22,0.05)] transition-colors"
          >
            <span>Заполнить данные</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* СКВОЗНОЙ ПЕРЕНОС 2027 → 2028 (СТР. 8 И ТЕСТ 10 ТЗ v1.0) */}
      {selectedYear === 2028 && schedule.yearBoundaryCarryover && (
        <div
          data-testid="fin-carryover-2027-2028-bar"
          className="card-elevated rounded-2xl border border-[#141413]/[0.07] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#191816] px-4 py-3.5 sm:px-5 shadow-[0_1px_2px_rgba(20,20,19,0.03)] space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#141413] px-2.5 py-1 font-display-num text-[11px] font-medium text-white">
                <Layers className="h-3 w-3" />
                <span>31.12.2027 → 01.01.2028</span>
              </span>
              <span className="text-[12.5px] font-medium text-[#141413] dark:text-[#F5F4F0]">
                Переходящие остатки, выплаты WB и обязательства из 2027 года
              </span>
            </div>
            <span className="text-[11.5px] text-[#7A766E] dark:text-[#9A968E]">
              {schedule.yearBoundaryCarryover.carriedOverCashAppliedToStart
                ? 'Стартовый кэш 2028 перенесён с 31.12.2027'
                : 'Задан ручной стартовый кэш 2028'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 text-xs">
            <div className="rounded-xl border border-[#ECEAE3] dark:border-[#262522] bg-white dark:bg-[#151514] px-3.5 py-2.5">
              <div className="text-[11px] text-[#7A766E] dark:text-[#9A968E]">
                Склад и возвраты на 31.12.2027
              </div>
              <div className="mt-1 font-display-num tabular-nums text-[14px] font-semibold text-[#141413] dark:text-[#F5F4F0] whitespace-nowrap">
                {schedule.yearBoundaryCarryover.carriedOverStockUnitsFrom2027.toLocaleString('ru-RU')} ед.
                {schedule.yearBoundaryCarryover.carriedOverReturnsInTransitUnitsFrom2027 > 0 && (
                  <span className="ml-1.5 text-[11px] font-normal text-[#7A766E]">
                    (+{schedule.yearBoundaryCarryover.carriedOverReturnsInTransitUnitsFrom2027.toLocaleString('ru-RU')} возвр.)
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-[#ECEAE3] dark:border-[#262522] bg-white dark:bg-[#151514] px-3.5 py-2.5">
              <div className="text-[11px] text-[#7A766E] dark:text-[#9A968E]">
                Переходящий остаток денег
              </div>
              <div className="mt-1">
                <MoneyFigure
                  valueRub={schedule.yearBoundaryCarryover.carriedOverCashFrom2027Rub}
                  className="text-[14px] font-semibold text-[#0F766E] dark:text-emerald-400"
                  unitClassName="!text-[#0F766E]/70 dark:!text-emerald-400/70"
                />
              </div>
            </div>

            <div className="rounded-xl border border-[#ECEAE3] dark:border-[#262522] bg-white dark:bg-[#151514] px-3.5 py-2.5">
              <div className="text-[11px] text-[#7A766E] dark:text-[#9A968E]">
                Декабрьские выплаты WB (в янв. 2028)
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <MoneyFigure
                  valueRub={schedule.yearBoundaryCarryover.carriedOverWbPayoutsFromDec2027Rub}
                  signed
                  className="text-[14px] font-semibold text-[#0F766E] dark:text-emerald-400"
                  unitClassName="!text-[#0F766E]/70 dark:!text-emerald-400/70"
                />
                <span className="text-[11px] text-[#7A766E] whitespace-nowrap">
                  ({schedule.yearBoundaryCarryover.carriedOverWbPayoutsEventsCount} выпл.)
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-[#ECEAE3] dark:border-[#262522] bg-white dark:bg-[#151514] px-3.5 py-2.5">
              <div className="text-[11px] text-[#7A766E] dark:text-[#9A968E]">
                Переходящие доплаты фабрикам
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <MoneyFigure
                  valueRub={
                    schedule.yearBoundaryCarryover.carriedOverPayablesFrom2027Rub > 0
                      ? -schedule.yearBoundaryCarryover.carriedOverPayablesFrom2027Rub
                      : 0
                  }
                  className="text-[14px] font-semibold text-[#B91C1C] dark:text-rose-400"
                  unitClassName="!text-[#B91C1C]/70 dark:!text-rose-400/70"
                />
                {schedule.yearBoundaryCarryover.carriedOverPayablesEventsCount > 0 && (
                  <span className="text-[11px] text-[#7A766E] whitespace-nowrap">
                    ({schedule.yearBoundaryCarryover.carriedOverPayablesEventsCount} плат.)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* РАЗДЕЛ 3 ТЗ: ГЛАВНЫЙ ЭКРАН — ЧЕТЫРЕ ОСНОВНЫХ ПОКАЗАТЕЛЯ (ИДЕАЛЬНОЕ ВЫРАВНИВАНИЕ БАЗОВОЙ ЛИНИИ) */}
      <div
        data-testid="fin-four-main-kpis"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        {/* 1. План продаж */}
        <div
          title="1. План продаж"
          aria-label="1. План продаж"
          className="card-elevated rounded-2xl border border-[#141413]/[0.07] dark:border-[#282724] bg-white dark:bg-[#151514] p-5 shadow-[0_1px_2px_rgba(20,20,19,0.035),0_4px_12px_-4px_rgba(20,20,19,0.025)] flex flex-col justify-between min-h-[154px]"
        >
          <div>
            <div className="h-5 flex items-center justify-between gap-2 text-[12.5px] font-medium text-[#6B6760] dark:text-[#9A968E] whitespace-nowrap">
              <span className="truncate">План продаж</span>
              <span className="font-display-num text-[11px] text-[#9A958C] dark:text-[#78746C]">
                {selectedYear}
              </span>
            </div>
            <div
              data-testid="fin-kpi-sales-plan"
              className="mt-4 text-[#141413] dark:text-[#F5F4F0]"
            >
              <MoneyFigure
                valueRub={schedule.totalGrossSalesRevenueRub}
                title={fmtRub(schedule.totalGrossSalesRevenueRub)}
                className="text-[28px] xl:text-[31px] font-semibold tracking-[-0.03em] leading-none"
              />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#F0EDE6] dark:border-[#242320] text-[11.5px] text-[#6B6760] dark:text-[#9A968E]">
            {schedule.compatibleUnitsBreakdown.length === 1 ? (
              (() => {
                const uRow = schedule.compatibleUnitsBreakdown[0]!;
                const { shortUnit } = getCompatibleUnitShortDisplay(uRow);
                return (
                  <div className="whitespace-nowrap truncate">
                    <span className="font-display-num tabular-nums font-medium text-[#3D3A36] dark:text-[#D4D1CA]">
                      {uRow.buyoutsQty.toLocaleString('ru-RU')} {shortUnit}
                    </span>
                    <span className="mx-1.5 text-[#C8C3B8]">·</span>
                    <span>план {selectedYear}</span>
                  </div>
                );
              })()
            ) : schedule.compatibleUnitsBreakdown.length > 1 ? (
              <div
                data-testid="fin-kpi-sales-compatible-units"
                className="flex flex-wrap items-center gap-1"
              >
                {schedule.compatibleUnitsBreakdown.map((uRow) => {
                  const { categoryName, shortUnit } = getCompatibleUnitShortDisplay(uRow);
                  return (
                    <span
                      key={uRow.unitCategory}
                      className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#F6F5F1] dark:bg-[#1D1C1A] font-display-num tabular-nums text-[10.5px] text-[#3D3A36] dark:text-[#D4D1CA] whitespace-nowrap"
                    >
                      {categoryName}: {uRow.buyoutsQty.toLocaleString('ru-RU')} {shortUnit}
                    </span>
                  );
                })}
              </div>
            ) : (
              <div>Прогнозируемая выручка · {selectedYear}</div>
            )}
          </div>
        </div>

        {/* 2. Стоимость закупок */}
        <div
          title="2. Стоимость закупок"
          aria-label="2. Стоимость закупок"
          className="card-elevated rounded-2xl border border-[#141413]/[0.07] dark:border-[#282724] bg-white dark:bg-[#151514] p-5 shadow-[0_1px_2px_rgba(20,20,19,0.035),0_4px_12px_-4px_rgba(20,20,19,0.025)] flex flex-col justify-between min-h-[154px]"
        >
          <div>
            <div className="h-5 flex items-center justify-between gap-2 text-[12.5px] font-medium text-[#6B6760] dark:text-[#9A968E] whitespace-nowrap">
              <span className="truncate">Стоимость закупок</span>
              <span className="font-display-num text-[11px] text-[#9A958C] dark:text-[#78746C]">
                {pluralizeBatchesRu(schedule.batchesTotalCount)}
              </span>
            </div>
            <div
              data-testid="fin-kpi-procurement-cost"
              className="mt-4 text-[#141413] dark:text-[#F5F4F0]"
            >
              <MoneyFigure
                valueRub={schedule.totalProcurementCostRub}
                title={fmtRub(schedule.totalProcurementCostRub)}
                className="text-[28px] xl:text-[31px] font-semibold tracking-[-0.03em] leading-none"
              />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#F0EDE6] dark:border-[#242320] text-[11.5px] text-[#6B6760] dark:text-[#9A968E] space-y-1">
            {schedule.compatibleUnitsBreakdown.length === 1 ? (
              (() => {
                const uRow = schedule.compatibleUnitsBreakdown[0]!;
                const { shortUnit } = getCompatibleUnitShortDisplay(uRow);
                return (
                  <div className="whitespace-nowrap truncate">
                    <span className="font-display-num tabular-nums font-medium text-[#3D3A36] dark:text-[#D4D1CA]">
                      {uRow.procurementQty.toLocaleString('ru-RU')} {shortUnit}
                    </span>
                    <span className="mx-1.5 text-[#C8C3B8]">·</span>
                    <span>{pluralizeBatchesRu(schedule.batchesTotalCount)}</span>
                  </div>
                );
              })()
            ) : schedule.compatibleUnitsBreakdown.length > 1 ? (
              <div className="flex flex-wrap items-center gap-1">
                {schedule.compatibleUnitsBreakdown.map((uRow) => {
                  const { categoryName, shortUnit } = getCompatibleUnitShortDisplay(uRow);
                  return (
                    <span
                      key={uRow.unitCategory}
                      className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#F6F5F1] dark:bg-[#1D1C1A] font-display-num tabular-nums text-[10.5px] text-[#3D3A36] dark:text-[#D4D1CA] whitespace-nowrap"
                    >
                      {categoryName}: {uRow.procurementQty.toLocaleString('ru-RU')} {shortUnit}
                    </span>
                  );
                })}
              </div>
            ) : (
              <div>{pluralizeBatchesRu(schedule.batchesTotalCount)} за период</div>
            )}
          </div>
        </div>

        {/* 3. Максимальная потребность в своих деньгах */}
        <div
          title="3. Максимальная потребность в своих деньгах"
          aria-label="3. Максимальная потребность в своих деньгах"
          className="card-elevated rounded-2xl border border-[#141413]/[0.07] dark:border-[#282724] bg-white dark:bg-[#151514] p-5 shadow-[0_1px_2px_rgba(20,20,19,0.035),0_4px_12px_-4px_rgba(20,20,19,0.025)] flex flex-col justify-between min-h-[154px]"
        >
          <div>
            <div className="h-5 flex items-center justify-between gap-2 text-[12.5px] font-medium text-[#6B6760] dark:text-[#9A968E] whitespace-nowrap">
              <span className="truncate">Свои деньги (пик)</span>
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                  schedule.isPreliminaryCalculation
                    ? 'bg-[#D97706]'
                    : (schedule.remainingOwnMoneyNeededRub ?? 0) > 0
                    ? 'bg-[#141413] dark:bg-[#E5E2DC]'
                    : 'bg-[#0F766E] dark:bg-emerald-400'
                }`}
              />
            </div>
            <div
              data-testid="fin-kpi-max-own-money"
              className="mt-4 text-[#141413] dark:text-[#F5F4F0]"
            >
              {!schedule.wbPayoutScheduleSpecified ? (
                <span className="text-[22px] xl:text-[24px] font-semibold tracking-[-0.02em] leading-none text-[#7A766E] dark:text-[#9A968E]">
                  Укажите срок WB
                </span>
              ) : (
                <MoneyFigure
                  valueRub={schedule.calculatedCapitalNeedRub ?? 0}
                  title={fmtRub(schedule.calculatedCapitalNeedRub ?? 0)}
                  className="text-[28px] xl:text-[31px] font-semibold tracking-[-0.03em] leading-none"
                />
              )}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#F0EDE6] dark:border-[#242320] text-[11.5px] text-[#6B6760] dark:text-[#9A968E] space-y-0.5">
            <div className="truncate">
              {schedule.wbPayoutScheduleSpecified ? (
                <>
                  <span>Макс. потребность</span>
                  <span className="mx-1.5 text-[#C8C3B8]">·</span>
                  <span>
                    Пик:{' '}
                    <span className="font-medium text-[#3D3A36] dark:text-[#D4D1CA]">
                      {schedule.peakShortageMonthFullRu}
                    </span>
                  </span>
                </>
              ) : (
                'Требуется срок поступления от WB'
              )}
            </div>
            {schedule.isGroupAllBrands && (
              <div className="text-[10.5px] text-[#8C877E] dark:text-[#8E8A82] truncate">
                {groupCapitalMode === 'per_brand'
                  ? 'Режим: каждый бренд сам (сумма пиков)'
                  : 'Режим: общий денежный котёл группы'}
              </div>
            )}
          </div>
        </div>

        {/* 4. Реинвестирование */}
        <div
          title="4. Реинвестирование"
          aria-label="4. Реинвестирование"
          className="card-elevated rounded-2xl border border-[#141413]/[0.07] dark:border-[#282724] bg-white dark:bg-[#151514] p-5 shadow-[0_1px_2px_rgba(20,20,19,0.035),0_4px_12px_-4px_rgba(20,20,19,0.025)] flex flex-col justify-between min-h-[154px]"
        >
          <div>
            <div className="h-5 flex items-center justify-between gap-2 text-[12.5px] font-medium text-[#6B6760] dark:text-[#9A968E] whitespace-nowrap">
              <span className="inline-flex items-center gap-1.5 truncate">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-[#0F766E] dark:bg-emerald-400 shrink-0"
                />
                <span className="truncate">Реинвестирование</span>
              </span>
              {schedule.wbPayoutScheduleSpecified && (
                <span className="font-display-num tabular-nums text-[11.5px] font-medium text-[#0F766E] dark:text-emerald-400">
                  {schedule.reinvestedSharePct}%
                </span>
              )}
            </div>
            <div
              data-testid="inv-reinvested-value"
              className="mt-4 text-[#0F766E] dark:text-emerald-400"
            >
              {!schedule.wbPayoutScheduleSpecified ||
              schedule.reinvestedFromSalesRub === null ? (
                <span className="font-display-num text-[28px] xl:text-[31px] font-semibold leading-none text-[#8C877E]">
                  —
                </span>
              ) : (
                <MoneyFigure
                  valueRub={schedule.reinvestedFromSalesRub}
                  title={fmtRub(schedule.reinvestedFromSalesRub)}
                  className="text-[28px] xl:text-[31px] font-semibold tracking-[-0.03em] leading-none text-[#0F766E] dark:text-emerald-400"
                  unitClassName="!text-[#0F766E]/70 dark:!text-emerald-400/70"
                />
              )}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#F0EDE6] dark:border-[#242320] text-[11.5px] text-[#6B6760] dark:text-[#9A968E] space-y-1.5">
            {schedule.wbPayoutScheduleSpecified && (
              <div className="h-1 w-full rounded-full bg-[#EFECE6] dark:bg-[#242320] overflow-hidden">
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, schedule.reinvestedSharePct))}%`,
                  }}
                  className="h-full rounded-full bg-[#0F766E] dark:bg-emerald-400 transition-all duration-300"
                />
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">
                {schedule.wbPayoutScheduleSpecified
                  ? `${schedule.reinvestedSharePct}% закупок из оборота`
                  : 'По операциям поступлений от продаж'}
              </span>
            </div>
            {(schedule.missingCostModelsCount > 0 ||
              schedule.excludedZeroCostWbPayoutRub > 0) && (
              <div
                data-testid="fin-reinvest-zero-cost-note"
                className="text-[10.5px] text-[#8C877E] dark:text-[#8E8A82] truncate"
                title={`SKU без себестоимости (${schedule.missingCostModelsCount}) исключены из пула реинвестирования`}
              >
                Без {schedule.missingCostModelsCount} SKU без себестоимости
              </div>
            )}
          </div>
        </div>
      </div>

      {/* СВОДНАЯ КАРТОЧКА ЭКОНОМИКИ И ПРИБЫЛЬНОСТИ С ВИЗУАЛЬНОЙ ПОЛОСОЙ СТРУКТУРЫ ВЫРУЧКИ */}
      <div
        data-testid="fin-expenses-profit-strip"
        className="card-elevated rounded-2xl border border-[#141413]/[0.07] dark:border-[#282724] bg-white dark:bg-[#151514] p-5 sm:p-6 shadow-[0_1px_2px_rgba(20,20,19,0.035),0_4px_12px_-4px_rgba(20,20,19,0.025)] space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[14.5px] font-semibold tracking-[-0.015em] text-[#141413] dark:text-[#F5F4F0]">
              Экономика и прибыльность · {selectedYear}
            </h3>
            <p className="mt-0.5 text-[12px] text-[#7A766E] dark:text-[#9A968E]">
              Распределение выручки: удержания маркетплейса, себестоимость, налоги и операционная прибыль
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
                className="h-8 px-3 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] hover:border-[#C8C3B8] dark:hover:border-[#3E3C37] text-[12px] font-medium text-[#141413] dark:text-[#F5F4F0] inline-flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors"
              >
                <span>+ Расход</span>
              </button>
            )}

            <button
              type="button"
              data-testid="fin-strip-toggle-analytics-btn"
              onClick={() => setShowDetailedAnalytics((v) => !v)}
              className="h-8 px-3 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] hover:bg-[#FAF9F6] dark:hover:bg-[#1D1C1A] text-[12px] font-medium text-[#5C5953] hover:text-[#141413] dark:text-[#9A968E] dark:hover:text-[#F5F4F0] inline-flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors"
            >
              <span>Подробная аналитика {showDetailedAnalytics ? '▴' : '▾'}</span>
            </button>
          </div>
        </div>

        {/* Визуальная полоса структуры выручки (100% Revenue Waterfall Bar) */}
        <div
          role="img"
          aria-label={`Структура выручки: удержания WB ${wbSharePct}%, себестоимость ${cogsSharePct}%, налоги и OPEX ${taxOpexSharePct}%, прибыль ${profitSharePct}%`}
          className="h-2.5 w-full rounded-full bg-[#F1EFE9] dark:bg-[#23221F] overflow-hidden flex gap-[2px]"
        >
          {barWbWidthPct > 0 && (
            <div
              style={{ width: `${barWbWidthPct}%` }}
              title={`Удержания WB: ${fmtMln(resolvedWbDeductionsRub)} (${wbSharePct.toFixed(1).replace('.', ',')}%)`}
              className="h-full bg-[#8C877E] dark:bg-[#7A766E] first:rounded-l-full last:rounded-r-full transition-all duration-300"
            />
          )}
          {barCogsWidthPct > 0 && (
            <div
              style={{ width: `${barCogsWidthPct}%` }}
              title={`Себестоимость (COGS): ${fmtMln(resolvedSoldGoodsCostRub)} (${cogsSharePct.toFixed(1).replace('.', ',')}%)`}
              className="h-full bg-[#3F3D39] dark:bg-[#B8B3A8] first:rounded-l-full last:rounded-r-full transition-all duration-300"
            />
          )}
          {barTaxOpexWidthPct > 0 && (
            <div
              style={{ width: `${barTaxOpexWidthPct}%` }}
              title={`Налоги и OPEX: ${fmtMln(resolvedTaxAndOpexTotalRub)} (${taxOpexSharePct.toFixed(1).replace('.', ',')}%)`}
              className="h-full bg-[#C8965E] dark:bg-[#D4A56A] first:rounded-l-full last:rounded-r-full transition-all duration-300"
            />
          )}
          {barProfitWidthPct > 0 && (
            <div
              style={{ width: `${barProfitWidthPct}%` }}
              title={`Операционная прибыль: ${fmtMln(resolvedOperatingProfitRub)} (${resolvedOperatingMarginPct.toFixed(1).replace('.', ',')}%)`}
              className="h-full bg-[#0F766E] dark:bg-emerald-500 first:rounded-l-full last:rounded-r-full transition-all duration-300"
            />
          )}
        </div>

        {/* 5 чистых колонок экономики с вертикальными разделителями */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-y-5 lg:gap-y-0 lg:divide-x divide-[#EFECE6] dark:divide-[#262522]">
          {/* 1) Удержания WB */}
          <div className="pr-3 lg:pr-4 flex flex-col justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#6B6760] dark:text-[#9A968E] whitespace-nowrap">
                <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-[#8C877E] shrink-0" />
                <span className="truncate">Удержания WB</span>
              </div>
              <div
                data-testid="fin-strip-wb-deductions"
                className="mt-2 text-[#141413] dark:text-[#F5F4F0]"
              >
                <MoneyFigure
                  valueRub={resolvedWbDeductionsRub}
                  title={fmtRub(resolvedWbDeductionsRub)}
                  className="text-[20px] xl:text-[21px] font-semibold tracking-[-0.025em] leading-none"
                />
              </div>
            </div>
            <div className="text-[11px] text-[#7A766E] dark:text-[#9A968E] space-y-0.5 leading-snug">
              <div className="whitespace-nowrap">
                <span className="font-display-num tabular-nums">{resolvedWbDeductionsPct.toFixed(1).replace('.', ',')}%</span> от выручки
              </div>
              {resolvedReverseLogisticsRub > 0 && (
                <div
                  data-testid="fin-strip-reverse-logistics"
                  className="text-[10.5px] text-[#8C877E] dark:text-[#8E8A82] whitespace-nowrap"
                >
                  обр. логистика:{' '}
                  <span className="font-display-num tabular-nums whitespace-nowrap">
                    {fmtMln(resolvedReverseLogisticsRub)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 2) Налоги и OPEX */}
          <div className="pl-2 sm:pl-3 lg:px-4 flex flex-col justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#6B6760] dark:text-[#9A968E] whitespace-nowrap">
                <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-[#C8965E] shrink-0" />
                <span className="truncate">Налоги и OPEX</span>
              </div>
              <div
                data-testid="fin-strip-tax-opex"
                className="mt-2 text-[#141413] dark:text-[#F5F4F0]"
              >
                <MoneyFigure
                  valueRub={resolvedTaxAndOpexTotalRub}
                  title={fmtRub(resolvedTaxAndOpexTotalRub)}
                  className="text-[20px] xl:text-[21px] font-semibold tracking-[-0.025em] leading-none"
                />
              </div>
            </div>
            <div className="text-[11px] text-[#7A766E] dark:text-[#9A968E] space-y-0.5 leading-snug">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="whitespace-nowrap">
                  Налоги{' '}
                  <span className="font-display-num tabular-nums">{fmtMln(resolvedTaxRub)}</span>
                </span>
                <span className="text-[#C8C3B8]">·</span>
                <span className="whitespace-nowrap">
                  OPEX{' '}
                  <span className="font-display-num tabular-nums">{fmtMln(resolvedOpexRub)}</span>
                </span>
              </div>
              {schedule.totalOtherExpensesRub > 0 && (
                <div className="text-[10.5px] text-[#9A5B13] dark:text-amber-300 whitespace-nowrap">
                  + доп. расходы{' '}
                  <span className="font-display-num tabular-nums">
                    {fmtMln(schedule.totalOtherExpensesRub)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 3) Чистые поступления WB */}
          <div className="pr-3 lg:px-4 flex flex-col justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#6B6760] dark:text-[#9A968E] whitespace-nowrap">
                <span
                  aria-hidden="true"
                  className="h-[7px] w-[7px] rounded-full border-[1.5px] border-[#8C877E] shrink-0"
                />
                <span className="truncate">Поступления WB</span>
              </div>
              <div
                data-testid="fin-strip-wb-net-proceeds"
                className="mt-2 text-[#141413] dark:text-[#F5F4F0]"
              >
                <MoneyFigure
                  valueRub={resolvedNetWbProceedsRub}
                  title={fmtRub(resolvedNetWbProceedsRub)}
                  className="text-[20px] xl:text-[21px] font-semibold tracking-[-0.025em] leading-none"
                />
              </div>
            </div>
            <div className="text-[11px] text-[#7A766E] dark:text-[#9A968E] whitespace-nowrap leading-snug">
              <span className="font-display-num tabular-nums">{resolvedNetWbProceedsPct.toFixed(1).replace('.', ',')}%</span> к перечислению
            </div>
          </div>

          {/* 4) Себестоимость продаж (COGS) */}
          <div className="pl-2 sm:pl-3 lg:px-4 flex flex-col justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#6B6760] dark:text-[#9A968E] whitespace-nowrap">
                <span
                  aria-hidden="true"
                  className="h-[7px] w-[7px] rounded-full bg-[#3F3D39] dark:bg-[#B8B3A8] shrink-0"
                />
                <span className="truncate">Себестоимость (COGS)</span>
              </div>
              <div
                data-testid="fin-strip-cogs"
                className="mt-2 text-[#141413] dark:text-[#F5F4F0]"
              >
                <MoneyFigure
                  valueRub={resolvedSoldGoodsCostRub}
                  title={fmtRub(resolvedSoldGoodsCostRub)}
                  className="text-[20px] xl:text-[21px] font-semibold tracking-[-0.025em] leading-none"
                />
              </div>
            </div>
            <div className="text-[11px] text-[#7A766E] dark:text-[#9A968E] whitespace-nowrap leading-snug">
              {schedule.missingCostModelsCount > 0 ? (
                <span>
                  <span className="font-display-num tabular-nums">{cogsSharePct.toFixed(1).replace('.', ',')}%</span> · без {schedule.missingCostModelsCount} SKU
                </span>
              ) : (
                <span>
                  <span className="font-display-num tabular-nums">{cogsSharePct.toFixed(1).replace('.', ',')}%</span> · по выкупам
                </span>
              )}
            </div>
          </div>

          {/* 5) Ожидаемая операционная прибыль (спокойная светлая/изумрудная колонка без оранжевого шума) */}
          <div className="col-span-2 lg:col-span-1 pt-4 lg:pt-0 border-t lg:border-t-0 border-[#EFECE6] dark:border-[#262522] lg:pl-4 flex flex-col justify-between gap-2">
            <div>
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#141413] dark:text-[#F5F4F0] whitespace-nowrap">
                  <span
                    aria-hidden="true"
                    className={`h-[7px] w-[7px] rounded-full shrink-0 ${
                      !schedule.isProfitComplete
                        ? 'bg-[#C8965E]'
                        : resolvedOperatingProfitRub >= 0
                        ? 'bg-[#0F766E] dark:bg-emerald-400'
                        : 'bg-[#B91C1C]'
                    }`}
                  />
                  <span>Ожидаемая прибыль</span>
                </div>
              </div>
              <div
                data-testid="fin-strip-operating-profit"
                className="mt-2"
              >
                <MoneyFigure
                  valueRub={resolvedOperatingProfitRub}
                  approx={!schedule.isProfitComplete}
                  title={fmtRub(resolvedOperatingProfitRub)}
                  className={`text-[20px] xl:text-[21px] font-semibold tracking-[-0.025em] leading-none ${
                    !schedule.isProfitComplete
                      ? 'text-[#9A5B13] dark:text-amber-300'
                      : resolvedOperatingProfitRub >= 0
                      ? 'text-[#0F766E] dark:text-emerald-400'
                      : 'text-[#B91C1C] dark:text-rose-400'
                  }`}
                  unitClassName={
                    !schedule.isProfitComplete
                      ? '!text-[#9A5B13]/70 dark:!text-amber-300/70'
                      : resolvedOperatingProfitRub >= 0
                      ? '!text-[#0F766E]/70 dark:!text-emerald-400/70'
                      : '!text-[#B91C1C]/70 dark:!text-rose-400/70'
                  }
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px] leading-snug">
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md font-display-num tabular-nums text-[11px] font-semibold whitespace-nowrap ${
                  !schedule.isProfitComplete
                    ? 'bg-[#FDF5E6] dark:bg-amber-500/15 text-[#9A5B13] dark:text-amber-300'
                    : resolvedOperatingProfitRub >= 0
                    ? 'bg-[#EAF6F0] dark:bg-emerald-500/15 text-[#0F766E] dark:text-emerald-400'
                    : 'bg-rose-50 dark:bg-rose-500/15 text-[#B91C1C] dark:text-rose-400'
                }`}
              >
                {!schedule.isProfitComplete ? '~' : ''}
                {resolvedOperatingMarginPct.toFixed(1).replace('.', ',')}%
              </span>

              {!schedule.isProfitComplete ? (
                <>
                  <span
                    data-testid="fin-profit-incomplete-badge"
                    className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#F5F2EB] dark:bg-[#23221F] text-[10.5px] font-medium text-[#7A766E] dark:text-[#9A968E] whitespace-nowrap"
                  >
                    Предварительно
                  </span>
                  <button
                    type="button"
                    data-testid="fin-profit-what-to-fill-btn"
                    onClick={handleOpenWhatToFill}
                    className="text-[11px] text-[#7A766E] dark:text-[#9A968E] hover:text-[#141413] dark:hover:text-[#F5F4F0] underline decoration-[#D6D2C9] dark:decoration-[#3E3C37] underline-offset-2 whitespace-nowrap cursor-pointer transition-colors"
                  >
                    уточнить
                  </button>
                </>
              ) : schedule.totalOtherExpensesRub > 0 ? (
                <span className="text-[#7A766E] dark:text-[#9A968E] whitespace-nowrap">
                  с доп. расходами
                </span>
              ) : (
                <span className="text-[#7A766E] dark:text-[#9A968E] whitespace-nowrap">
                  маржа плана
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* РАЗДЕЛ 7 ТЗ: СФОКУСИРОВАННАЯ ПОЛОСА «СЛЕДУЮЩЕЕ ДЕЙСТВИЕ» (БЕЗ ДУБЛИРОВАНИЯ КАРТОЧЕК) */}
      {(schedule.recommendations.length > 0 ||
        nextRequiredCashRow !== null ||
        schedule.nextUpcomingPayment !== null) && (
        <div
          data-testid="fin-recommendations-block"
          aria-label="Что нужно сделать · Следующее действие"
          className={`card-elevated rounded-2xl border border-[#141413]/[0.07] dark:border-[#282724] border-l-[3px] ${
            nextRequiredCashRow && nextRequiredCashRow.remainingNeedRub > 0
              ? 'border-l-[#B45309] dark:border-l-amber-500'
              : 'border-l-[#141413] dark:border-l-[#E5E2DC]'
          } bg-white dark:bg-[#151514] px-5 py-4 shadow-[0_1px_2px_rgba(20,20,19,0.035)]`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0 space-y-0.5">
              <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#7A766E] dark:text-[#9A968E]">
                Следующее действие
              </div>
              {nextRequiredCashRow ? (
                <p className="text-[14px] sm:text-[15px] font-medium text-[#141413] dark:text-[#F5F4F0] leading-snug">
                  К{' '}
                  <span className="font-semibold">
                    {nextRequiredCashRow.dateHumanRu || nextRequiredCashRow.dateDotRu}
                  </span>{' '}
                  подготовить{' '}
                  <MoneyFigure
                    valueRub={
                      nextRequiredCashRow.remainingNeedRub > 0
                        ? nextRequiredCashRow.remainingNeedRub
                        : nextRequiredCashRow.calculatedNeedRub
                    }
                    className="font-semibold text-[#141413] dark:text-[#F5F4F0]"
                    unitClassName="!text-[0.82em] !text-[#5C5953] dark:!text-[#9A968E]"
                  />
                  <span className="mx-1.5 text-[#C8C3B8]">·</span>
                  <span className="text-[#5C5953] dark:text-[#9A968E] font-normal">
                    {nextRequiredCashRow.batchesCount > 0
                      ? pluralizeBatchesRu(nextRequiredCashRow.batchesCount)
                      : nextRequiredCashRow.purposeLabel.toLowerCase()}
                  </span>
                </p>
              ) : schedule.nextUpcomingPayment ? (
                <p className="text-[14px] sm:text-[15px] font-medium text-[#141413] dark:text-[#F5F4F0] leading-snug">
                  Ближайший плановый платёж{' '}
                  <span className="font-display-num font-semibold">
                    {schedule.nextUpcomingPayment.dateDotRu}
                  </span>
                  <span className="mx-1.5 text-[#C8C3B8]">·</span>
                  <MoneyFigure
                    valueRub={schedule.nextUpcomingPayment.amountRub}
                    className="font-semibold text-[#141413] dark:text-[#F5F4F0]"
                    unitClassName="!text-[0.82em] !text-[#5C5953] dark:!text-[#9A968E]"
                  />
                  <span className="mx-1.5 text-[#C8C3B8]">·</span>
                  <span className="text-[#5C5953] dark:text-[#9A968E] font-normal">
                    {schedule.nextUpcomingPayment.factoryName}
                  </span>
                </p>
              ) : (
                <p className="text-[14px] font-medium text-[#141413] dark:text-[#F5F4F0]">
                  {schedule.recommendations[0]?.message ||
                    'План финансирования сбалансирован — все закупки покрываются поступлениями'}
                </p>
              )}
            </div>

            <button
              type="button"
              data-testid="fin-next-action-view-payments-btn"
              onClick={() =>
                handleFocusWhenDate(
                  nextRequiredCashRow?.dateIso || schedule.nextUpcomingPayment?.dateIso
                )
              }
              className="h-10 px-4 rounded-xl bg-[#141413] text-white hover:opacity-90 text-[13px] font-medium inline-flex items-center gap-2 shrink-0 whitespace-nowrap cursor-pointer shadow-[0_1px_2px_rgba(20,20,19,0.12)] transition-opacity"
            >
              <span>Посмотреть платежи</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Дополнительные недублирующиеся сигналы (например, риск дефицита товара) */}
          {secondaryRecommendations.length > 0 && (
            <div className="mt-3.5 pt-3 border-t border-[#F0EDE6] dark:border-[#242320] space-y-2">
              {secondaryRecommendations.slice(0, 3).map((rec) => {
                const dotCls =
                  rec.severity === 'danger'
                    ? 'bg-[#B91C1C]'
                    : rec.severity === 'warning'
                    ? 'bg-[#D97706]'
                    : 'bg-[#0F766E]';
                return (
                  <div
                    key={rec.id}
                    data-testid={`fin-rec-card-${rec.id}`}
                    className="flex flex-wrap items-center justify-between gap-2.5 text-[12.5px]"
                  >
                    <div className="flex items-center gap-2 min-w-0 text-[#3D3A36] dark:text-[#D4D1CA]">
                      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotCls}`} />
                      <span className="font-medium text-[#141413] dark:text-[#F5F4F0] shrink-0">
                        {rec.categoryLabel}:
                      </span>
                      <span className="text-[#5C5953] dark:text-[#9A968E] truncate">
                        {rec.message}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRecommendationAction(rec)}
                      className="text-[12px] font-medium text-[#141413] dark:text-[#F5F4F0] hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>{rec.ctaLabel}</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* РАЗДЕЛ 10 ТЗ: СПОКОЙНАЯ ОБЩАЯ СВОДКА ГРУППЫ (ПРИ ВЫБОРЕ «ВСЕ БРЕНДЫ») */}
      {normBrand === 'ALL' && holdingOverview && (
        <div
          data-testid="fin-holding-overview-section"
          className="card-elevated rounded-2xl border border-[#141413]/[0.07] dark:border-[#282724] bg-white dark:bg-[#151514] p-5 sm:p-6 shadow-[0_1px_2px_rgba(20,20,19,0.035),0_4px_12px_-4px_rgba(20,20,19,0.025)] space-y-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1 max-w-2xl">
              <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-[#141413] dark:text-[#F5F4F0]">
                Общая сводка группы · {selectedYear}
              </h3>
              <p
                data-testid="fin-group-capital-mode-caption"
                className="text-[12px] text-[#7A766E] dark:text-[#9A968E] leading-relaxed"
              >
                {groupCapitalMode === 'common_pool'
                  ? `Объединённый денежный календарь: пик не суммируется по брендам · экономия котла −${fmtMln(
                      schedule.commonPoolSavingsRub
                    )}.`
                  : `Автономное финансирование брендов: сумма отдельных пиков · потенциал общего котла −${fmtMln(
                      schedule.commonPoolSavingsRub
                    )}.`}
              </p>
            </div>

            {/* Apple-style segmented toggle для режимов капитала группы */}
            <div
              role="group"
              aria-label="Режим расчёта капитала группы"
              data-testid="group-capital-mode-toggle"
              className="inline-flex flex-wrap items-center gap-0.5 rounded-xl bg-[#EFECE6] dark:bg-[#1D1C1A] p-1 shrink-0"
            >
              {(
                [
                  { mode: 'common_pool' as GroupCapitalMode, label: 'Общий денежный котёл' },
                  { mode: 'per_brand' as GroupCapitalMode, label: 'Каждый бренд сам' },
                ] as const
              ).map((opt) => {
                const isSelected = groupCapitalMode === opt.mode;
                return (
                  <button
                    key={opt.mode}
                    type="button"
                    data-testid={`group-capital-mode-${opt.mode}`}
                    onClick={() => setGroupCapitalMode(opt.mode, authorName)}
                    className={`h-8 px-3 rounded-lg text-[12px] font-medium whitespace-nowrap cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-white dark:bg-[#2C2B28] text-[#141413] dark:text-[#F5F4F0] shadow-[0_1px_2px_rgba(20,20,19,0.08)]'
                        : 'text-[#6B6760] dark:text-[#9A968E] hover:text-[#141413] dark:hover:text-[#F5F4F0]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Раздельные совместимые физические единицы + экономия общего котла */}
          {schedule.compatibleUnitsBreakdown.length > 0 && (
            <div
              data-testid="fin-group-compatible-units"
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11.5px] text-[#7A766E] dark:text-[#9A968E]">
                  Объём продаж:
                </span>
                {schedule.compatibleUnitsBreakdown.map((uRow) => {
                  const { categoryName, shortUnit } = getCompatibleUnitShortDisplay(uRow);
                  return (
                    <span
                      key={uRow.unitCategory}
                      className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#F6F5F1] dark:bg-[#1D1C1A] font-display-num tabular-nums text-[11.5px] font-medium text-[#3D3A36] dark:text-[#D4D1CA] whitespace-nowrap"
                    >
                      {categoryName}: {uRow.buyoutsQty.toLocaleString('ru-RU')} {shortUnit}
                    </span>
                  );
                })}
              </div>

              {schedule.commonPoolSavingsRub > 0 && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-[#EAF6F0] dark:bg-emerald-500/12 font-display-num tabular-nums text-[11.5px] font-medium text-[#0F766E] dark:text-emerald-400 whitespace-nowrap">
                  {groupCapitalMode === 'common_pool'
                    ? `Экономия котла: −${fmtMln(schedule.commonPoolSavingsRub)}`
                    : `Потенциал котла: −${fmtMln(schedule.commonPoolSavingsRub)}`}
                </span>
              )}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-[#ECEAE3] dark:border-[#262522]">
            <table
              data-testid="fin-holding-overview-table"
              className="w-full min-w-[680px] border-collapse text-left text-[13px]"
            >
              <thead>
                <tr className="bg-[#FAF9F6] dark:bg-[#1A1917] border-b border-[#ECEAE3] dark:border-[#262522] text-[11px] uppercase tracking-[0.05em] text-[#7A766E] dark:text-[#9A968E]">
                  <th className="py-3 px-4 font-medium">Бренд и сценарий</th>
                  <th className="py-3 px-4 font-medium text-right">Выручка</th>
                  <th className="py-3 px-4 font-medium text-right">Закупки</th>
                  <th className="py-3 px-4 font-medium text-right">Свои деньги</th>
                  <th className="py-3 px-4 font-medium">Ближайший платёж</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EDE6] dark:divide-[#242320]">
                {holdingOverview.rows.map((row) => {
                  const isUnselected = row.scenarioId === null;
                  const brandVis = getBrandVisual(row.brandCode);
                  return (
                    <tr
                      key={row.brandCode}
                      data-testid={`fin-holding-row-${row.brandCode}`}
                      onClick={() => handleSelectBrandPill(row.brandCode)}
                      className="group hover:bg-[#FAF8F4] dark:hover:bg-[#1C1B18] cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#141413] dark:text-[#F5F4F0] inline-flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className={`h-2 w-2 rounded-full shrink-0 ${brandVis.dotClass}`}
                          />
                          <span>{row.displayBrandName}</span>
                          {row.isPreliminary && !isUnselected && (
                            <span className="rounded-md px-1.5 py-0.5 bg-[#FDF5E6] dark:bg-amber-500/15 text-[10px] font-medium text-[#9A5B13] dark:text-amber-300 whitespace-nowrap">
                              Предварительно
                            </span>
                          )}
                          <ArrowRight className="h-3.5 w-3.5 text-[#7A766E] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                        </div>
                        <div className="mt-0.5 pl-4 text-[11.5px] text-[#7A766E] dark:text-[#9A968E]">
                          {isUnselected ? (
                            <span className="text-[#9A5B13] dark:text-amber-300">
                              Не выбран · {row.scenarioYear} г.
                            </span>
                          ) : (
                            `${row.scenarioName} · ${row.scenarioYear}`
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right text-[#141413] dark:text-[#F5F4F0]">
                        {isUnselected ? (
                          <span className="text-[#8C877E]">—</span>
                        ) : (
                          <MoneyFigure
                            valueRub={row.revenueRub > 0 ? row.revenueRub : 0}
                            className="text-[13.5px] font-medium"
                            unitClassName="!text-[0.82em]"
                          />
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right text-[#3D3A36] dark:text-[#D4D1CA]">
                        {isUnselected ? (
                          <span className="text-[#8C877E]">—</span>
                        ) : (
                          <MoneyFigure
                            valueRub={row.procurementRub > 0 ? row.procurementRub : 0}
                            className="text-[13.5px] font-normal"
                            unitClassName="!text-[0.82em]"
                          />
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right text-[#141413] dark:text-[#F5F4F0]">
                        {isUnselected || row.ownMoneyNeedRub === null ? (
                          <span className="text-[#8C877E]">—</span>
                        ) : (
                          <MoneyFigure
                            valueRub={row.ownMoneyNeedRub}
                            className="text-[13.5px] font-semibold"
                            unitClassName="!text-[0.82em]"
                          />
                        )}
                        {!isUnselected &&
                          row.remainingOwnMoneyRub !== null &&
                          row.ownMoneyNeedRub !== null &&
                          row.remainingOwnMoneyRub < row.ownMoneyNeedRub && (
                            <div className="mt-0.5 text-[11px] font-display-num text-[#0F766E] dark:text-emerald-400 whitespace-nowrap">
                              осталось {fmtMln(row.remainingOwnMoneyRub)}
                            </div>
                          )}
                      </td>
                      <td className="py-3.5 px-4 text-[#7A766E] dark:text-[#9A968E]">
                        {isUnselected ? (
                          '—'
                        ) : row.nextPayment ? (
                          <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <span className="font-display-num tabular-nums font-medium text-[#141413] dark:text-[#F5F4F0]">
                              {row.nextPayment.dateDotRu}
                            </span>
                            <span className="text-[#C8C3B8]">·</span>
                            <span className="font-display-num tabular-nums text-[#B91C1C] dark:text-rose-400">
                              {fmtMln(row.nextPayment.amountRub)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[12px] text-[#8C877E]">Нет платежей</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[#FAF8F4] dark:bg-[#1A1917] border-t border-[#E6E3DB] dark:border-[#282724] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                  <td className="py-3.5 px-4 text-[12.5px]">
                    {groupCapitalMode === 'per_brand'
                      ? 'Итого группа · каждый бренд сам'
                      : 'Итого группа · общий денежный котёл'}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <MoneyFigure
                      valueRub={schedule.totalGrossSalesRevenueRub}
                      className="text-[13.5px] font-semibold"
                      unitClassName="!text-[0.82em]"
                    />
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <MoneyFigure
                      valueRub={schedule.totalProcurementCostRub}
                      className="text-[13.5px] font-semibold"
                      unitClassName="!text-[0.82em]"
                    />
                  </td>
                  <td
                    data-testid="fin-holding-total-own-money"
                    className="py-3.5 px-4 text-right"
                  >
                    {schedule.calculatedCapitalNeedRub !== null ? (
                      <MoneyFigure
                        valueRub={schedule.calculatedCapitalNeedRub}
                        className="text-[13.5px] font-semibold"
                        unitClassName="!text-[0.82em]"
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-3.5 px-4 font-normal text-[12.5px] text-[#6B6760] dark:text-[#9A968E] whitespace-nowrap">
                    {schedule.nextUpcomingPayment ? (
                      <span className="font-display-num tabular-nums">
                        {schedule.nextUpcomingPayment.dateDotRu} ·{' '}
                        {fmtMln(schedule.nextUpcomingPayment.amountRub)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* РАЗДЕЛ 5 И РАЗДЕЛ 9 ТЗ: СВОДКА ФИНАНСИРОВАНИЯ + ПОЛОСА ПРОГРЕССА + ВОЗВРАТ КАПИТАЛА */}
      <div className="card-elevated rounded-2xl border border-[#141413]/[0.07] dark:border-[#282724] bg-white dark:bg-[#151514] p-5 sm:p-6 shadow-[0_1px_2px_rgba(20,20,19,0.035),0_4px_12px_-4px_rgba(20,20,19,0.025)] space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Три показателя финансирования: План vs Факт */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 flex-1 min-w-[280px]">
            <div>
              <div className="text-[12px] font-medium text-[#6B6760] dark:text-[#9A968E]">
                Своих требуется
              </div>
              <div
                data-testid="fin-cap-calculated"
                className="mt-1.5 text-[#141413] dark:text-[#F5F4F0]"
              >
                {schedule.calculatedCapitalNeedRub !== null ? (
                  <MoneyFigure
                    valueRub={schedule.calculatedCapitalNeedRub}
                    className="text-[20px] sm:text-[22px] font-semibold tracking-[-0.025em] leading-none"
                  />
                ) : (
                  <span className="font-display-num text-[20px] font-semibold text-[#8C877E]">—</span>
                )}
              </div>
              <div className="mt-1 text-[11px] text-[#7A766E] dark:text-[#9A968E]">
                Расчётный пик потребности
              </div>
            </div>

            <div>
              <div className="text-[12px] font-medium text-[#6B6760] dark:text-[#9A968E]">
                Уже внесено (факт)
              </div>
              <div
                data-testid="fin-cap-contributed"
                className="mt-1.5 text-[#0F766E] dark:text-emerald-400"
              >
                <MoneyFigure
                  valueRub={schedule.factualOwnMoneyContributedRub}
                  className="text-[20px] sm:text-[22px] font-semibold tracking-[-0.025em] leading-none text-[#0F766E] dark:text-emerald-400"
                  unitClassName="!text-[#0F766E]/70 dark:!text-emerald-400/70"
                />
              </div>
              {schedule.plannedOwnMoneyInjectionsRub > 0 ? (
                <div
                  data-testid="fin-cap-planned-subnote"
                  className="mt-1 text-[11px] text-[#7A766E] dark:text-[#9A968E] whitespace-nowrap"
                >
                  Запланировано:{' '}
                  <span className="font-display-num tabular-nums font-medium text-[#3D3A36] dark:text-[#D4D1CA]">
                    {fmtMln(schedule.plannedOwnMoneyInjectionsRub)}
                  </span>
                </div>
              ) : (
                <div className="mt-1 text-[11px] text-[#7A766E] dark:text-[#9A968E]">
                  Стартовый остаток и взносы
                </div>
              )}
            </div>

            <div>
              <div className="text-[12px] font-medium text-[#6B6760] dark:text-[#9A968E]">
                Ещё покрыть
              </div>
              <div
                data-testid="inv-still-needed-value"
                className="mt-1.5"
              >
                {schedule.remainingOwnMoneyNeededRub === null ? (
                  <span className="font-display-num text-[20px] font-semibold text-[#8C877E]">—</span>
                ) : schedule.remainingOwnMoneyNeededRub > 0 ? (
                  <MoneyFigure
                    valueRub={schedule.remainingOwnMoneyNeededRub}
                    className="text-[20px] sm:text-[22px] font-semibold tracking-[-0.025em] leading-none text-[#B91C1C] dark:text-rose-400"
                    unitClassName="!text-[#B91C1C]/70 dark:!text-rose-400/70"
                  />
                ) : (
                  <span className="inline-flex items-baseline gap-1.5 font-display-num text-[20px] sm:text-[22px] font-semibold tracking-[-0.025em] leading-none text-[#0F766E] dark:text-emerald-400 whitespace-nowrap">
                    <span>0,00</span>
                    <span className="text-[0.58em] font-medium opacity-75">млн ₽ (закрыто)</span>
                  </span>
                )}
              </div>
              {schedule.remainingNeedAfterFactualOnlyRub !== null &&
                schedule.remainingOwnMoneyNeededRub !== null &&
                Math.abs(
                  schedule.remainingNeedAfterFactualOnlyRub -
                    schedule.remainingOwnMoneyNeededRub
                ) >= 1000 && (
                  <div
                    data-testid="fin-cap-remaining-factual-only"
                    className="mt-1 text-[11px] text-[#7A766E] dark:text-[#9A968E] whitespace-nowrap"
                  >
                    без плановых:{' '}
                    <span className="font-display-num tabular-nums font-medium">
                      {fmtMln(schedule.remainingNeedAfterFactualOnlyRub)}
                    </span>
                  </div>
                )}
              {schedule.totalOwnMoneyConfiguredRub > 0 &&
                (schedule.remainingOwnMoneyNeededRub ?? 0) >
                  Math.max(
                    0,
                    (schedule.calculatedCapitalNeedRub ?? 0) - schedule.totalOwnMoneyConfiguredRub
                  ) +
                    1000 && (
                  <div className="mt-1 text-[11px] text-[#9A5B13] dark:text-amber-300">
                    взнос позже платежа ({schedule.whenAndHowMuchRows[0]?.dateDotRu || ''})
                  </div>
                )}
            </div>
          </div>

          {/* Спокойные вторичные кнопки управления */}
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
                className={`h-9 px-3.5 rounded-xl text-[12.5px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                  showEditInvestmentPlan
                    ? 'bg-[#141413] text-white'
                    : 'bg-[#F3F1EC] dark:bg-[#23221F] hover:bg-[#E7E4DC] dark:hover:bg-[#2D2C28] text-[#141413] dark:text-[#F5F4F0]'
                }`}
              >
                <Wallet className="h-3.5 w-3.5" strokeWidth={1.6} />
                <span>Изменить план инвестиций</span>
              </button>
            )}

            <button
              type="button"
              data-testid="btn-compare-baseline"
              onClick={() => setShowBaselineComparison((v) => !v)}
              className={`h-9 px-3.5 rounded-xl border text-[12.5px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                showBaselineComparison || planComparison.hasDifferences
                  ? 'border-[#141413]/30 dark:border-[#F5F4F0]/30 bg-[#FAF9F6] dark:bg-[#1D1C1A] text-[#141413] dark:text-[#F5F4F0]'
                  : 'border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] text-[#5C5953] dark:text-[#9A968E] hover:text-[#141413] hover:bg-[#FAF9F6]'
              }`}
            >
              <GitCompare className="h-3.5 w-3.5" strokeWidth={1.6} />
              <span>Сравнить с исходным планом</span>
            </button>

            {canEdit && resetPreview.willResetCount > 0 && (
              <button
                type="button"
                data-testid="inv-reset-plan-btn"
                onClick={() => setShowResetPreviewModal(true)}
                className="h-9 px-3 rounded-xl border border-[#EED9B3] dark:border-amber-500/35 bg-[#FDF8EE] dark:bg-amber-500/10 text-[#7A4B16] dark:text-amber-300 text-[12px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Вернуть расчёт по плану ({resetPreview.willResetCount})</span>
              </button>
            )}
          </div>
        </div>

        {/* Тонкая полоса прогресса покрытия потребности фактом */}
        {requiredCapitalRub > 0 && (
          <div className="space-y-1.5">
            <div className="h-[5px] w-full rounded-full bg-[#EFECE6] dark:bg-[#242320] overflow-hidden flex">
              {factualFundedSharePct > 0 && (
                <div
                  style={{ width: `${factualFundedSharePct}%` }}
                  className="h-full bg-[#0F766E] dark:bg-emerald-500 transition-all duration-300"
                />
              )}
              {plannedFundedSharePct > 0 && (
                <div
                  style={{ width: `${plannedFundedSharePct}%` }}
                  className="h-full bg-[#0F766E]/35 dark:bg-emerald-500/35 transition-all duration-300"
                />
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#7A766E] dark:text-[#9A968E]">
              <span className="font-display-num tabular-nums">
                Внесено фактом: {factualFundedSharePct}% от расчётного пика
              </span>
              {plannedFundedSharePct > 0 && (
                <span className="font-display-num tabular-nums">
                  С учётом запланированных взносов: {Math.min(100, factualFundedSharePct + plannedFundedSharePct)}%
                </span>
              )}
            </div>
          </div>
        )}

        {/* СТР. 9 ТЗ v1.0: ПРОГНОЗ ВОЗВРАТА ВЛОЖЕННОГО КАПИТАЛА */}
        <div
          data-testid="fin-capital-return-forecast"
          title={schedule.capitalReturnForecast.disclaimerRu}
          className="pt-3.5 border-t border-[#F0EDE6] dark:border-[#242320] flex flex-wrap items-center justify-between gap-2 text-[12px]"
        >
          <div className="flex flex-wrap items-center gap-2">
            {!schedule.wbPayoutScheduleSpecified ? (
              <span className="inline-flex items-center gap-1.5 text-[#7A766E] dark:text-[#9A968E]">
                <Clock className="h-3.5 w-3.5" strokeWidth={1.6} />
                <span>Возврат вложенного: укажите срок выплат WB</span>
              </span>
            ) : schedule.capitalReturnForecast.deployedOwnCapitalRub <= 0 ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EAF6F0] dark:bg-emerald-500/12 text-[12px] font-medium text-[#0F766E] dark:text-emerald-400">
                <Clock className="h-3.5 w-3.5" strokeWidth={1.7} />
                <span>Возврат вложенного: собственные вложения не требуются</span>
              </span>
            ) : schedule.capitalReturnForecast.canReturnWithinHorizon &&
              schedule.capitalReturnForecast.eligibleDateHumanRu ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EAF6F0] dark:bg-emerald-500/12 text-[12px] font-medium text-[#0F766E] dark:text-emerald-400 whitespace-nowrap">
                <Clock className="h-3.5 w-3.5" strokeWidth={1.7} />
                <span>
                  Возврат вложенного: с{' '}
                  <strong className="font-semibold">
                    {schedule.capitalReturnForecast.eligibleDateHumanRu}
                  </strong>
                </span>
                {schedule.capitalReturnForecast.eligibleDateDotRu && (
                  <span className="font-display-num tabular-nums opacity-75">
                    ({schedule.capitalReturnForecast.eligibleDateDotRu})
                  </span>
                )}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F5F2EB] dark:bg-[#1D1C1A] text-[12px] font-medium text-[#6B6760] dark:text-[#9A968E]">
                <Clock className="h-3.5 w-3.5" strokeWidth={1.6} />
                <span>Возврат вложенного: за пределами горизонта с сохранением резерва</span>
              </span>
            )}
          </div>
          <span className="text-[11px] text-[#8C877E] dark:text-[#8E8A82]">
            {schedule.capitalReturnForecast.disclaimerRu}
          </span>
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
            className="pt-4 border-t border-[#F0EDE6] dark:border-[#242320] space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[13.5px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                Сравнение с исходным автоматическим планом
              </div>
              <span className="text-xs text-[#6B6760] dark:text-[#9A968E]">
                {planComparison.summaryVerdictRu}
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#ECEAE3] dark:border-[#262522]">
              <table className="w-full min-w-[560px] border-collapse text-left text-[12.5px]">
                <thead>
                  <tr className="bg-[#FAF9F6] dark:bg-[#1A1917] border-b border-[#ECEAE3] dark:border-[#262522] text-[11px] uppercase tracking-[0.05em] text-[#7A766E]">
                    <th className="py-2.5 px-3.5 font-medium">Показатель</th>
                    <th className="py-2.5 px-3.5 font-medium text-right">Исходный план</th>
                    <th className="py-2.5 px-3.5 font-medium text-right">Текущий план</th>
                    <th className="py-2.5 px-3.5 font-medium text-right">Изменение</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EDE6] dark:divide-[#242320]">
                  <tr>
                    <td className="py-2.5 px-3.5 font-medium">Стоимость закупок</td>
                    <td className="py-2.5 px-3.5 text-right font-display-num tabular-nums whitespace-nowrap">{fmtMln(planComparison.autoProcurementRub)}</td>
                    <td className="py-2.5 px-3.5 text-right font-display-num tabular-nums font-semibold whitespace-nowrap">{fmtMln(planComparison.currentProcurementRub)}</td>
                    <td className="py-2.5 px-3.5 text-right font-display-num tabular-nums whitespace-nowrap">{fmtSignedDeltaMln(planComparison.deltaProcurementRub)}</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3.5 font-medium">Расчётная потребность в своих деньгах</td>
                    <td className="py-2.5 px-3.5 text-right font-display-num tabular-nums whitespace-nowrap">
                      {planComparison.autoCalculatedNeedRub !== null ? fmtMln(planComparison.autoCalculatedNeedRub) : '—'}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-display-num tabular-nums font-semibold whitespace-nowrap">
                      {planComparison.currentCalculatedNeedRub !== null ? fmtMln(planComparison.currentCalculatedNeedRub) : '—'}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-display-num tabular-nums whitespace-nowrap">
                      {planComparison.deltaCalculatedNeedRub !== null ? fmtSignedDeltaMln(planComparison.deltaCalculatedNeedRub) : '—'}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3.5 font-medium">Оставшаяся сумма финансирования</td>
                    <td className="py-2.5 px-3.5 text-right font-display-num tabular-nums whitespace-nowrap">
                      {planComparison.autoRemainingNeedRub !== null ? fmtMln(planComparison.autoRemainingNeedRub) : '—'}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-display-num tabular-nums font-semibold whitespace-nowrap">
                      {planComparison.currentRemainingNeedRub !== null ? fmtMln(planComparison.currentRemainingNeedRub) : '—'}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-display-num tabular-nums whitespace-nowrap">
                      {planComparison.deltaRemainingNeedRub !== null ? fmtSignedDeltaMln(planComparison.deltaRemainingNeedRub) : '—'}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3.5 font-medium">Обеспеченность товаром (дефицит)</td>
                    <td className="py-2.5 px-3.5 text-right font-display-num tabular-nums whitespace-nowrap">
                      {planComparison.autoDeficitPacks.toLocaleString('ru-RU')} ед.
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-display-num tabular-nums font-semibold whitespace-nowrap">
                      {planComparison.currentDeficitPacks.toLocaleString('ru-RU')} ед.
                    </td>
                    <td className={`py-2.5 px-3.5 text-right font-display-num tabular-nums whitespace-nowrap ${planComparison.deltaDeficitPacks > 0 ? 'text-[#B91C1C]' : 'text-[#0F766E]'}`}>
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
          className="rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-4 space-y-2"
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
                onClick={() =>
                  handleJumpToProcurementBatch(sw.modelId, undefined, {
                    batchKey: sw.batchKey,
                    modelCode: sw.modelCode,
                  })
                }
                className="h-7.5 px-3 rounded-lg bg-white dark:bg-[#151514] border border-rose-500/30 text-[#B91C1C] dark:text-rose-300 text-[11.5px] font-medium whitespace-nowrap cursor-pointer shrink-0"
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
        className="card-elevated rounded-2xl border border-[#141413]/[0.07] dark:border-[#282724] bg-white dark:bg-[#151514] p-5 sm:p-6 shadow-[0_1px_2px_rgba(20,20,19,0.035),0_4px_12px_-4px_rgba(20,20,19,0.025)] space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-[15.5px] font-semibold tracking-[-0.015em] text-[#141413] dark:text-[#F5F4F0]">
                Когда и сколько вложить
              </h3>
              {schedule.wbPayoutScheduleSpecified &&
                schedule.capitalReturnForecast.deployedOwnCapitalRub > 0 && (
                  <span
                    title={schedule.capitalReturnForecast.disclaimerRu}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 text-[11.5px] font-medium whitespace-nowrap ${
                      schedule.capitalReturnForecast.canReturnWithinHorizon
                        ? 'bg-[#EAF6F0] dark:bg-emerald-500/12 text-[#0F766E] dark:text-emerald-400'
                        : 'bg-[#F5F2EB] dark:bg-[#1D1C1A] text-[#6B6760] dark:text-[#9A968E]'
                    }`}
                  >
                    <Clock className="h-3 w-3" />
                    <span>
                      {schedule.capitalReturnForecast.canReturnWithinHorizon &&
                      schedule.capitalReturnForecast.eligibleDateHumanRu
                        ? `Возврат: с ${schedule.capitalReturnForecast.eligibleDateHumanRu}`
                        : 'Возврат: за пределами периода'}
                    </span>
                  </span>
                )}
            </div>
            <p className="text-[12px] text-[#7A766E] dark:text-[#9A968E]">
              Даты финансирования закупочных партий. Раскройте дату, чтобы увидеть товары, скорректировать платёж или перейти к партии.
            </p>
          </div>

          {allFactoryPaymentEvents.length > 0 && (
            <button
              type="button"
              data-testid="btn-toggle-all-factory-payments"
              onClick={() => setShowAllFactoryPayments((v) => !v)}
              className="h-8 px-3 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] hover:border-[#C8C3B8] text-[12px] font-medium text-[#3D3A36] dark:text-[#F5F4F0] whitespace-nowrap cursor-pointer transition-colors shrink-0"
            >
              {showAllFactoryPayments
                ? 'Только даты вложений'
                : `Все платежи фабрикам (${allFactoryPaymentEvents.length})`}
            </button>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#ECEAE3] dark:border-[#262522]">
          <table
            data-testid="when-and-how-much-table"
            className="w-full min-w-[640px] border-collapse text-left text-[13px]"
          >
            <thead>
              <tr className="bg-[#FAF9F6] dark:bg-[#1A1917] border-b border-[#ECEAE3] dark:border-[#262522] text-[11px] uppercase tracking-[0.05em] text-[#7A766E] dark:text-[#9A968E]">
                <th className="py-3 px-4 font-medium">Дата</th>
                <th className="py-3 px-4 font-medium">Нужно вложить</th>
                <th className="py-3 px-4 font-medium">На что нужны деньги</th>
                <th className="py-3 px-4 font-medium text-right">Действие</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EDE6] dark:divide-[#242320]">
              {schedule.whenAndHowMuchRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-7 px-4 text-center text-[13px] text-[#7A766E] dark:text-[#9A968E]">
                    {!schedule.wbPayoutScheduleSpecified
                      ? 'Укажите срок поступлений от Wildberries в разделе «Изменить план инвестиций», чтобы рассчитать точные даты вложений.'
                      : 'Все плановые закупочные платежи покрываются текущими средствами и поступлениями от продаж.'}
                  </td>
                </tr>
              ) : (
                schedule.whenAndHowMuchRows.map((row) => {
                  const isExp = expandedWhenDates.has(row.dateIso);
                  const isPreSalesYear = row.dateIso < `${selectedYear}-01-01`;
                  return (
                    <React.Fragment key={row.dateIso}>
                      <tr
                        data-testid={`when-row-${row.dateIso}`}
                        onClick={() => toggleWhenRow(row.dateIso)}
                        className={`hover:bg-[#FAF8F4] dark:hover:bg-[#1C1B18] cursor-pointer transition-colors ${
                          isExp
                            ? 'bg-[#FAF8F4] dark:bg-[#1B1A17]'
                            : isPreSalesYear
                            ? 'bg-[#FDFBF6] dark:bg-amber-500/[0.025]'
                            : ''
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-display-num tabular-nums font-semibold text-[#141413] dark:text-[#F5F4F0] whitespace-nowrap">
                              {row.dateDotRu}
                            </span>
                            {isPreSalesYear && (
                              <span
                                data-testid={`when-pre-year-badge-${row.dateIso}`}
                                className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#FDF5E6] dark:bg-amber-500/15 text-[10.5px] font-medium text-[#9A5B13] dark:text-amber-300 whitespace-nowrap"
                              >
                                До начала {selectedYear}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <MoneyFigure
                              valueRub={row.calculatedNeedRub}
                              title={fmtRub(row.calculatedNeedRub)}
                              className="text-[14.5px] font-semibold text-[#141413] dark:text-[#F5F4F0]"
                              unitClassName="!text-[0.8em]"
                            />
                            {row.coveredByOwnMoneyRub > 0 && (
                              <span
                                className={`px-2 py-0.5 rounded-md font-display-num tabular-nums text-[11px] font-medium whitespace-nowrap ${
                                  row.isFullyCoveredByOwnMoney
                                    ? 'bg-[#EAF6F0] dark:bg-emerald-500/15 text-[#0F766E] dark:text-emerald-400'
                                    : 'bg-[#FDF5E6] dark:bg-amber-500/15 text-[#9A5B13] dark:text-amber-300'
                                }`}
                              >
                                {row.isFullyCoveredByOwnMoney
                                  ? 'Закрыто'
                                  : `Осталось ${fmtMln(row.remainingNeedRub)}`}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-[#141413] dark:text-[#F5F4F0]">
                          <span>{row.purposeLabel}</span>
                          {row.batchesCount > 0 && (
                            <span className="ml-1.5 text-[12px] text-[#7A766E] dark:text-[#9A968E] whitespace-nowrap">
                              · {pluralizeBatchesRu(row.batchesCount)}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            data-testid={`when-row-toggle-${row.dateIso}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleWhenRow(row.dateIso);
                            }}
                            className={`h-8 px-3 rounded-lg text-[12px] font-medium inline-flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors ${
                              isExp
                                ? 'bg-[#EFECE6] dark:bg-[#2A2925] text-[#141413] dark:text-[#F5F4F0]'
                                : 'border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] hover:bg-[#FAF9F6] text-[#3D3A36] dark:text-[#F5F4F0]'
                            }`}
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

                      {/* СТР. 6 ТЗ v1.0: «ОДИН ПЛАТЁЖ — КОНКРЕТНЫЕ ТОВАРЫ» (РЕДАКТОРСКИЙ СПИСОК БЕЗ «ЧЁРНОЙ СТЕНЫ») */}
                      {isExp && (
                        <tr>
                          <td
                            colSpan={4}
                            className="bg-[#FAF8F4] dark:bg-[#181715] px-4 py-3.5"
                          >
                            <div className="space-y-2">
                              {row.factoryPayments.map((fp) => {
                                const isPrepayRole = fp.event.paymentRole === 'prepay';
                                const isBalanceRole = fp.event.paymentRole === 'balance';
                                const roleBadgeLabel = isPrepayRole
                                  ? `Аванс ${fp.prepaymentPct}%`
                                  : isBalanceRole
                                  ? `Доплата ${Math.max(0, 100 - fp.prepaymentPct)}%`
                                  : fp.paymentStageLabel;
                                const isPaidFactual = fp.status === 'Оплачено';
                                const statusBadgeCls = isPaidFactual
                                  ? 'bg-[#EAF6F0] dark:bg-emerald-500/15 text-[#0F766E] dark:text-emerald-400'
                                  : fp.status === 'Утверждено' || fp.isApprovedPo
                                  ? 'bg-sky-500/10 text-sky-800 dark:text-sky-300'
                                  : 'bg-[#F5F4F0] dark:bg-[#22211E] text-[#7A766E] dark:text-[#9A968E]';
                                const targetBrandCode =
                                  fp.brandCode ||
                                  (fp.event.brandCode === 'ALL' ? undefined : fp.event.brandCode);
                                const targetBrandVis = targetBrandCode
                                  ? getBrandVisual(targetBrandCode)
                                  : null;

                                return (
                                  <div
                                    key={fp.opKey}
                                    data-testid={`factory-payment-item-${fp.opKey}`}
                                    className="group rounded-xl border border-[#ECEAE3] dark:border-[#262522] bg-white dark:bg-[#151514] hover:border-[#D6D2C9] dark:hover:border-[#383632] px-3.5 py-3 shadow-[0_1px_2px_rgba(20,20,19,0.025)] flex flex-col lg:flex-row lg:items-center justify-between gap-3 transition-colors"
                                  >
                                    {/* Левая часть: 48px фото/монограмма + название + компактные бейджи + строка метаданных */}
                                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                      <SkuPaymentThumbnail
                                        src={fp.thumbnailUrl}
                                        alt={fp.productTitle}
                                        code={fp.modelCode}
                                        brandCode={targetBrandCode}
                                      />

                                      <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleJumpToProcurementBatch(
                                                fp.modelId,
                                                targetBrandCode,
                                                {
                                                  batchKey: fp.batchKey,
                                                  modelCode: fp.modelCode,
                                                  dateIso: row.dateIso,
                                                }
                                              )
                                            }
                                            className="text-left text-[13.5px] font-semibold text-[#141413] dark:text-[#F5F4F0] hover:underline cursor-pointer truncate max-w-full"
                                          >
                                            {fp.productTitle}
                                          </button>

                                          {normBrand === 'ALL' && targetBrandCode && targetBrandVis && (
                                            <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md bg-[#F6F5F1] dark:bg-[#22211E] text-[10.5px] font-medium text-[#3D3A36] dark:text-[#D4D1CA] whitespace-nowrap">
                                              <span
                                                aria-hidden="true"
                                                className={`h-1.5 w-1.5 rounded-full shrink-0 ${targetBrandVis.dotClass}`}
                                              />
                                              <span>{getBrandShortLabel(targetBrandCode)}</span>
                                            </span>
                                          )}

                                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#F3F1EC] dark:bg-[#23221F] font-display-num text-[11px] font-medium text-[#3D3A36] dark:text-[#D4D1CA] whitespace-nowrap">
                                            {roleBadgeLabel}
                                          </span>

                                          <span
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-medium whitespace-nowrap ${statusBadgeCls}`}
                                          >
                                            {(fp.isApprovedLocked || isPaidFactual) && (
                                              <Lock className="h-2.5 w-2.5" />
                                            )}
                                            <span>{fp.status}</span>
                                          </span>

                                          {fp.hasManualOverride && (
                                            <span className="px-1.5 py-0.5 rounded-md bg-[#FDF5E6] dark:bg-amber-500/15 text-[#9A5B13] dark:text-amber-300 text-[10.5px] font-medium whitespace-nowrap">
                                              изм.
                                            </span>
                                          )}
                                        </div>

                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-[#7A766E] dark:text-[#9A968E] leading-snug">
                                          <span className="font-display-num tabular-nums font-medium text-[#3D3A36] dark:text-[#D4D1CA] whitespace-nowrap">
                                            {fp.packsQty.toLocaleString('ru-RU')} {fp.unitLabel}
                                          </span>
                                          <span className="text-[#D2CEC4]">·</span>
                                          <span className="truncate max-w-[220px]">{fp.factoryName}</span>
                                          <span className="text-[#D2CEC4]">·</span>
                                          <span className="whitespace-nowrap">
                                            Поставка{' '}
                                            <span className="font-display-num tabular-nums font-medium text-[#3D3A36] dark:text-[#D4D1CA]">
                                              {fp.arrivalDateDotRu}
                                            </span>
                                          </span>
                                          {isPrepayRole && fp.balanceAmountRub > 0 && (
                                            <>
                                              <span className="text-[#D2CEC4]">·</span>
                                              <span className="whitespace-nowrap">
                                                Доплата{' '}
                                                <span className="font-display-num tabular-nums font-medium text-[#3D3A36] dark:text-[#D4D1CA]">
                                                  {fmtMln(fp.balanceAmountRub)}
                                                </span>{' '}
                                                к{' '}
                                                <span className="font-display-num tabular-nums">
                                                  {fp.balanceDateDotRu}
                                                </span>
                                              </span>
                                            </>
                                          )}
                                          {isBalanceRole && (
                                            <>
                                              <span className="text-[#D2CEC4]">·</span>
                                              <span className="whitespace-nowrap">
                                                Оконч. расчёт (аванс {fp.prepaymentPct}%)
                                              </span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Правая часть: сумма + 3 лёгкие аккуратные кнопки (без тяжёлых чёрных кирпичей) */}
                                    <div className="flex flex-wrap sm:flex-nowrap items-center justify-between lg:justify-end gap-3.5 pt-2.5 lg:pt-0 border-t lg:border-t-0 border-[#F0EDE6] dark:border-[#242320] shrink-0">
                                      <div className="text-left lg:text-right min-w-[100px]">
                                        <MoneyFigure
                                          valueRub={fp.amountRub}
                                          title={fmtRub(fp.amountRub)}
                                          className="text-[16px] font-semibold tracking-[-0.02em] leading-none text-[#141413] dark:text-[#F5F4F0]"
                                        />
                                        <div className="mt-1 font-display-num tabular-nums text-[11px] text-[#8C877E] dark:text-[#8E8A82]">
                                          {fp.paymentDateDotRu}
                                        </div>
                                      </div>

                                      <div className="inline-flex flex-wrap items-center gap-1.5">
                                        {canEdit &&
                                          !fp.isApprovedLocked &&
                                          !isPaidFactual && (
                                            <button
                                              type="button"
                                              data-testid={`quick-shift-next-month-${fp.opKey}`}
                                              onClick={() =>
                                                handleQuickShiftFactoryPaymentNextMonth(fp.event)
                                              }
                                              className="h-8 px-2.5 rounded-lg text-[11.5px] font-medium text-[#5C5953] dark:text-[#9A968E] hover:text-[#141413] dark:hover:text-[#F5F4F0] hover:bg-[#F1EFE9] dark:hover:bg-[#23221F] whitespace-nowrap cursor-pointer transition-colors"
                                              title="Перенести плановый платёж на следующий месяц"
                                            >
                                              На след. мес.
                                            </button>
                                          )}

                                        <button
                                          type="button"
                                          data-testid={`open-payment-editor-${fp.opKey}`}
                                          onClick={() => setSelectedOpId(fp.event.id)}
                                          className="h-8 px-3 rounded-lg bg-[#F3F1EC] dark:bg-[#23221F] hover:bg-[#E7E4DC] dark:hover:bg-[#2D2C28] text-[11.5px] font-medium text-[#141413] dark:text-[#F5F4F0] whitespace-nowrap cursor-pointer transition-colors"
                                        >
                                          Редактировать
                                        </button>

                                        {fp.modelId && (
                                          <button
                                            type="button"
                                            data-testid={`open-procurement-batch-${fp.opKey}`}
                                            onClick={() =>
                                              handleJumpToProcurementBatch(
                                                fp.modelId,
                                                targetBrandCode,
                                                {
                                                  batchKey: fp.batchKey,
                                                  modelCode: fp.modelCode,
                                                  dateIso: row.dateIso,
                                                }
                                              )
                                            }
                                            className="h-8 px-3 rounded-lg border border-[#DCD8CE] dark:border-[#383632] bg-white dark:bg-transparent text-[11.5px] font-medium text-[#141413] dark:text-[#F5F4F0] hover:bg-[#141413] hover:text-white hover:border-[#141413] dark:hover:bg-[#F5F4F0] dark:hover:text-[#141413] dark:hover:border-[#F5F4F0] inline-flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors"
                                          >
                                            <span>Партия</span>
                                            <ArrowRight className="h-3 w-3" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}

                              {row.otherExpenseEvents.length > 0 && (
                                <div className="rounded-xl border border-[#ECEAE3] dark:border-[#262522] bg-white dark:bg-[#151514] divide-y divide-[#F0EDE6] dark:divide-[#242320]">
                                  {row.otherExpenseEvents.map((oe) => (
                                    <div
                                      key={oe.id}
                                      className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                                    >
                                      <div>
                                        <span className="font-medium text-[#141413] dark:text-[#F5F4F0]">
                                          {oe.title}
                                        </span>
                                        <span className="ml-2 text-[11px] text-[#7A766E]">
                                          {oe.status} · {formatIsoDateDotRu(oe.dateIso)}
                                        </span>
                                      </div>
                                      <MoneyFigure
                                        valueRub={oe.outflowRub}
                                        className="text-[13.5px] font-semibold text-[#141413] dark:text-[#F5F4F0]"
                                        unitClassName="!text-[0.82em]"
                                      />
                                    </div>
                                  ))}
                                </div>
                              )}
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
            <div className="text-[12px] font-medium text-[#6B6760] dark:text-[#9A968E]">
              Все платежи фабрикам по календарю периода ({allFactoryPaymentEvents.length})
            </div>
            <div className="overflow-x-auto max-h-80 rounded-xl border border-[#ECEAE3] dark:border-[#262522]">
              <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
                <thead className="sticky top-0 bg-[#FAF9F6] dark:bg-[#1A1917] border-b border-[#ECEAE3] dark:border-[#262522] text-[10.5px] uppercase tracking-[0.05em] text-[#7A766E]">
                  <tr>
                    <th className="py-2.5 px-3.5 font-medium">Дата</th>
                    <th className="py-2.5 px-3.5 font-medium">Партия и товар</th>
                    <th className="py-2.5 px-3 font-medium">Фабрика</th>
                    <th className="py-2.5 px-3 font-medium text-right">Сумма</th>
                    <th className="py-2.5 px-3 font-medium text-right">Из продаж WB</th>
                    <th className="py-2.5 px-3.5 font-medium text-right">Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EDE6] dark:divide-[#242320]">
                  {allFactoryPaymentEvents.map((ev) => (
                    <tr
                      key={ev.id}
                      className="hover:bg-[#FAF8F4] dark:hover:bg-[#1C1B18] transition-colors"
                    >
                      <td className="py-2.5 px-3.5 font-display-num tabular-nums whitespace-nowrap">
                        {formatIsoDateDotRu(ev.dateIso)}
                      </td>
                      <td className="py-2.5 px-3.5">
                        <div className="font-medium text-[#141413] dark:text-[#F5F4F0]">
                          {ev.title}
                        </div>
                        <div className="text-[11px] text-[#7A766E]">
                          {ev.status}
                          {ev.batchDetails
                            ? ` · поступление ${formatIsoDateDotRu(ev.batchDetails.arrivalDateIso)}`
                            : ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-[#6B6760]">{ev.factoryName || '—'}</td>
                      <td className="py-2.5 px-3 text-right font-display-num tabular-nums font-semibold whitespace-nowrap">
                        {fmtMln(ev.amountRub)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-display-num tabular-nums text-[#0F766E] dark:text-emerald-400 whitespace-nowrap">
                        {ev.reinvestedFromSalesRub > 0
                          ? fmtMln(ev.reinvestedFromSalesRub)
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedOpId(ev.id)}
                          className="h-7 px-2.5 rounded-lg bg-[#F3F1EC] dark:bg-[#23221F] hover:bg-[#E7E4DC] text-[11px] font-medium text-[#141413] dark:text-[#F5F4F0] cursor-pointer transition-colors"
                        >
                          Редактировать
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

      {/* СТР. 6 И 10 ТЗ v1.0 (ТЕСТЫ 04 И 05): МОДАЛЬНОЕ ОКНО РЕДАКТИРОВАНИЯ ПЛАТЕЖА / АВАНСА / ОБЪЁМА С LIVE-ПРЕДПРОСМОТРОМ «БЫЛО → СТАЛО» */}
      {selectedEvent &&
        (() => {
          const isFactualPaidLocked =
            selectedEvent.status === 'Оплачено' || selectedEvent.isFactual;
          const isApprovedPoGuard =
            !isFactualPaidLocked &&
            Boolean(selectedEvent.batchDetails?.isApprovedPo || selectedEvent.isApprovedLocked);
          const beforeDeficitPacks = liveEditPreview
            ? liveEditPreview.before.supplyDeficitWarnings.reduce(
                (s, w) => s + w.deficitPacks,
                0
              )
            : 0;
          const afterDeficitPacks = liveEditPreview
            ? liveEditPreview.after.supplyDeficitWarnings.reduce(
                (s, w) => s + w.deficitPacks,
                0
              )
            : 0;
          const shiftedArrivalWarningIso =
            liveEditPreview?.newSupplyDeficits[0]?.shiftedArrivalDateIso || null;

          return (
            <div
              onClick={() => setSelectedOpId(null)}
              className="fixed inset-0 z-[115] bg-black/50 backdrop-blur-[2px] overflow-y-auto p-3 sm:p-6 flex items-start sm:items-center justify-center"
            >
              <div
                data-testid="inv-operation-inspector"
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-3xl my-4 rounded-2xl border border-[#141413] dark:border-[#5C5953] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-4 sm:p-6 space-y-4 shadow-2xl"
              >
                {/* Заголовок модалки с фото SKU */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {selectedEvent.batchDetails && (
                      <SkuPaymentThumbnail
                        src={selectedEvent.batchDetails.thumbnailUrl}
                        alt={selectedEvent.batchDetails.modelTitle}
                        code={selectedEvent.batchDetails.modelCode}
                        brandCode={
                          selectedEvent.batchDetails.brandCode ||
                          (selectedEvent.brandCode === 'ALL'
                            ? undefined
                            : selectedEvent.brandCode)
                        }
                      />
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-[#141413] text-white font-mono text-[10px] font-semibold uppercase">
                          Редактирование закупочного платежа
                        </span>
                        {isFactualPaidLocked ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[#15803D] font-mono text-[10px] font-semibold">
                            <Lock className="h-3 w-3" />
                            <span>Фактический платёж (Оплачено)</span>
                          </span>
                        ) : isApprovedPoGuard ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-amber-900 dark:text-amber-300 font-mono text-[10px] font-semibold">
                            <Lock className="h-3 w-3" />
                            <span>Согласованный заказ ({selectedEvent.status})</span>
                          </span>
                        ) : null}
                      </div>
                      <h4 className="mt-1.5 text-[15px] font-semibold text-[#141413] dark:text-[#F5F4F0] leading-snug">
                        {selectedEvent.title}
                      </h4>
                      {selectedEvent.batchDetails && (
                        <div className="mt-0.5 text-[11.5px] text-[#5C5953] dark:text-[#9A968E]">
                          {selectedEvent.batchDetails.factoryName} ·{' '}
                          {selectedEvent.batchDetails.packsQty.toLocaleString('ru-RU')}{' '}
                          {selectedEvent.batchDetails.primaryUnitLabel} · полная цена партии{' '}
                          <span className="font-mono font-medium text-[#141413] dark:text-[#F5F4F0]">
                            {fmtMln(selectedEvent.batchDetails.totalBatchCostRub)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {selectedEvent.batchDetails && (
                      <button
                        type="button"
                        onClick={() =>
                          handleJumpToProcurementBatch(
                            selectedEvent.batchDetails!.modelId,
                            selectedEvent.batchDetails!.brandCode ||
                              (selectedEvent.brandCode === 'ALL'
                                ? undefined
                                : selectedEvent.brandCode),
                            {
                              batchKey: selectedEvent.batchKey,
                              modelCode: selectedEvent.batchDetails!.modelCode,
                              dateIso: selectedEvent.dateIso,
                            }
                          )
                        }
                        className="h-8 px-3 rounded-lg bg-[#141413] dark:bg-[#F5F4F0] text-white dark:text-[#141413] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>Открыть партию →</span>
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="Закрыть окно редактирования платежа"
                      onClick={() => setSelectedOpId(null)}
                      className="h-8 w-8 rounded-lg border border-[#E4E1DA] bg-white dark:bg-[#151514] text-[#5C5953] hover:text-[#141413] inline-flex items-center justify-center cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Защита фактических оплаченных операций (Стр. 6 и 10 ТЗ v1.0) */}
                {isFactualPaidLocked && (
                  <div
                    data-testid="inv-factual-payment-locked-banner"
                    className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3.5 flex items-start gap-2.5 text-xs text-[#15803D] dark:text-emerald-300"
                  >
                    <Lock className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="font-semibold">
                        Фактический платёж защищён от перезаписи
                      </div>
                      <p className="text-[11.5px] opacity-90">
                        Операция имеет статус «Оплачено». Фактические платежи не перезаписываются плановыми корректировками и защищены при возврате к автоматическому плану.
                      </p>
                    </div>
                  </div>
                )}

                {/* Просмотр для роли без права редактирования */}
                {!canEdit && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-[#E4E1DA] dark:border-[#282724] text-xs">
                    <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-2.5">
                      <div className="text-[#5C5953]">Дата оплаты</div>
                      <div className="mt-0.5 font-mono font-semibold text-[#141413] dark:text-[#F5F4F0]">
                        {formatIsoDateDotRu(selectedEvent.dateIso)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-2.5">
                      <div className="text-[#5C5953]">Сумма</div>
                      <div className="mt-0.5 font-mono font-semibold text-[#141413] dark:text-[#F5F4F0]">
                        {fmtMln(selectedEvent.amountRub)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-2.5">
                      <div className="text-[#5C5953]">Статус</div>
                      <div className="mt-0.5 font-medium text-[#141413] dark:text-[#F5F4F0]">
                        {selectedEvent.status}
                      </div>
                    </div>
                    <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-2.5">
                      <div className="text-[#5C5953]">Поставка</div>
                      <div className="mt-0.5 font-mono font-semibold text-[#141413] dark:text-[#F5F4F0]">
                        {selectedEvent.batchDetails
                          ? formatIsoDateDotRu(selectedEvent.batchDetails.arrivalDateIso)
                          : '—'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Форма редактирования параметров платежа и партии */}
                {canEdit && (
                  <div className="space-y-4 pt-2 border-t border-[#E4E1DA] dark:border-[#282724] text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <label className="space-y-1">
                        <span className="text-[#5C5953]">Дата оплаты</span>
                        <input
                          type="date"
                          data-testid="inv-edit-payment-date"
                          disabled={isFactualPaidLocked}
                          value={editDateIso}
                          onChange={(e) => setEditDateIso(e.target.value)}
                          className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] font-mono disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="text-[#5C5953]">Сумма платежа, ₽</span>
                        <input
                          type="number"
                          min={0}
                          step={10000}
                          data-testid="inv-edit-payment-amount"
                          disabled={isFactualPaidLocked}
                          value={editAmountRub}
                          onChange={(e) => {
                            setEditAmountRub(e.target.value);
                            setAmountManuallyEdited(true);
                          }}
                          className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] font-mono disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="text-[#5C5953]">Фабрика / поставщик</span>
                        <input
                          type="text"
                          disabled={isFactualPaidLocked}
                          value={editSupplier}
                          onChange={(e) => setEditSupplier(e.target.value)}
                          className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="text-[#5C5953]">Статус операции</span>
                        <select
                          data-testid="inv-edit-payment-status"
                          disabled={isFactualPaidLocked}
                          value={editStatus}
                          onChange={(e) =>
                            setEditStatus(e.target.value as OperationPaymentStatus)
                          }
                          className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <option value="Запланировано">Запланировано</option>
                          <option value="Утверждено">Утверждено</option>
                          <option value="Оплачено">Оплачено</option>
                        </select>
                      </label>
                    </div>

                    {selectedEvent.batchDetails && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <label className="space-y-1">
                          <span className="text-[#5C5953]">Аванс фабрике, %</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={5}
                            data-testid="inv-edit-prepay-pct"
                            disabled={isFactualPaidLocked}
                            value={editPrepayPct}
                            onChange={(e) => handleEditPrepayPctChange(e.target.value)}
                            className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] font-mono disabled:opacity-60 disabled:cursor-not-allowed"
                          />
                        </label>

                        {pairedBalanceEvent && (
                          <label className="space-y-1">
                            <span className="text-[#5C5953]">Дата окончательного платежа</span>
                            <input
                              type="date"
                              data-testid="inv-edit-balance-date"
                              disabled={isFactualPaidLocked}
                              value={editBalanceDateIso}
                              onChange={(e) => setEditBalanceDateIso(e.target.value)}
                              className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] font-mono disabled:opacity-60 disabled:cursor-not-allowed"
                            />
                          </label>
                        )}

                        <label className="space-y-1">
                          <span className="text-[#5C5953]">
                            Объём партии ({selectedEvent.batchDetails.primaryUnitLabel})
                          </span>
                          <input
                            type="number"
                            min={0}
                            step={50}
                            data-testid="inv-edit-packs-qty"
                            disabled={isFactualPaidLocked}
                            value={editPacksQty}
                            onChange={(e) => handleEditPacksQtyChange(e.target.value)}
                            className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] font-mono disabled:opacity-60 disabled:cursor-not-allowed"
                          />
                        </label>

                        <label className="space-y-1">
                          <span className="text-[#5C5953]">Дата поступления на склад</span>
                          <input
                            type="date"
                            data-testid="inv-edit-arrival-date"
                            disabled={isFactualPaidLocked}
                            value={editArrivalDateIso}
                            onChange={(e) => setEditArrivalDateIso(e.target.value)}
                            className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] font-mono disabled:opacity-60 disabled:cursor-not-allowed"
                          />
                        </label>
                      </div>
                    )}

                    {/* LIVE-КАРТОЧКА «ПОСЛЕДСТВИЯ КОРРЕКТИРОВКИ (ДО СОХРАНЕНИЯ)» — «БЫЛО → СТАЛО» */}
                    {liveEditPreview && !isFactualPaidLocked && (
                      <div
                        data-testid="edit-consequences-preview"
                        className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-3.5 sm:p-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-[12.5px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                            Последствия корректировки (до сохранения)
                          </div>
                          <span className="font-mono text-[10.5px] px-2 py-0.5 rounded bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-[#5C5953] dark:text-[#9A968E]">
                            Было → Стало
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                          {/* 1. Потребность в своих */}
                          <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-2.5 space-y-1">
                            <div className="text-[11px] text-[#5C5953] dark:text-[#9A968E]">
                              Потребность в своих:
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 font-mono font-semibold text-[#141413] dark:text-[#F5F4F0]">
                              <span>
                                {liveEditPreview.before.calculatedCapitalNeedRub !== null
                                  ? fmtMln(liveEditPreview.before.calculatedCapitalNeedRub)
                                  : '—'}
                              </span>
                              <span className="text-[#5C5953]">→</span>
                              <span>
                                {liveEditPreview.after.calculatedCapitalNeedRub !== null
                                  ? fmtMln(liveEditPreview.after.calculatedCapitalNeedRub)
                                  : '—'}
                              </span>
                              {liveEditPreview.deltaPeakCapitalRub !== null &&
                                Math.abs(liveEditPreview.deltaPeakCapitalRub) >= 1000 && (
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10.5px] ${
                                      liveEditPreview.deltaPeakCapitalRub < 0
                                        ? 'bg-emerald-500/12 text-[#15803D] dark:text-emerald-400'
                                        : 'bg-rose-500/12 text-[#B91C1C] dark:text-rose-400'
                                    }`}
                                  >
                                    {fmtSignedDeltaMln(liveEditPreview.deltaPeakCapitalRub)}
                                  </span>
                                )}
                            </div>
                          </div>

                          {/* 2. Аванс / Доплата (полная цена PO сохраняется) */}
                          <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-2.5 space-y-1">
                            <div className="text-[11px] text-[#5C5953] dark:text-[#9A968E]">
                              Аванс / Доплата (полная цена PO сохраняется):
                            </div>
                            <div className="space-y-0.5 font-mono text-[11.5px]">
                              <div className="flex flex-wrap items-center gap-1.5 text-[#141413] dark:text-[#F5F4F0]">
                                <span className="text-[#5C5953] font-sans">Аванс:</span>
                                <span>{fmtMln(liveEditPreview.oldPrepaymentRub)}</span>
                                <span className="text-[#5C5953]">→</span>
                                <span className="font-semibold">
                                  {fmtMln(liveEditPreview.newPrepaymentRub)}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 text-[#141413] dark:text-[#F5F4F0]">
                                <span className="text-[#5C5953] font-sans">Доплата:</span>
                                <span>{fmtMln(liveEditPreview.oldBalancePaymentRub)}</span>
                                <span className="text-[#5C5953]">→</span>
                                <span
                                  className={`font-semibold ${
                                    liveEditPreview.newBalancePaymentRub !==
                                    liveEditPreview.oldBalancePaymentRub
                                      ? 'text-amber-800 dark:text-amber-300'
                                      : ''
                                  }`}
                                >
                                  {fmtMln(liveEditPreview.newBalancePaymentRub)}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* 3. Дефицит SKU */}
                          <div
                            className={`rounded-lg border p-2.5 space-y-1 ${
                              afterDeficitPacks > 0 || liveEditPreview.supplyDeficitDeltaPacks > 0
                                ? 'border-rose-500/35 bg-rose-500/[0.06]'
                                : 'border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A]'
                            }`}
                          >
                            <div className="text-[11px] text-[#5C5953] dark:text-[#9A968E]">
                              Дефицит SKU:
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 font-mono font-semibold">
                              <span className="text-[#141413] dark:text-[#F5F4F0]">
                                {beforeDeficitPacks > 0
                                  ? `риск дефицита ${beforeDeficitPacks.toLocaleString('ru-RU')} шт.`
                                  : 'нет'}
                              </span>
                              <span className="text-[#5C5953]">→</span>
                              <span
                                className={
                                  afterDeficitPacks > 0
                                    ? 'text-[#B91C1C] dark:text-rose-400'
                                    : 'text-[#15803D] dark:text-emerald-400'
                                }
                              >
                                {afterDeficitPacks > 0
                                  ? `риск дефицита ${afterDeficitPacks.toLocaleString('ru-RU')} шт.`
                                  : 'без дефицита'}
                              </span>
                            </div>
                          </div>

                          {/* 4. Дата поставки */}
                          <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-2.5 space-y-1">
                            <div className="text-[11px] text-[#5C5953] dark:text-[#9A968E]">
                              Дата поставки:
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 font-mono font-semibold text-[#141413] dark:text-[#F5F4F0]">
                              <span>
                                {liveEditPreview.oldArrivalDateIso
                                  ? formatIsoDateDotRu(liveEditPreview.oldArrivalDateIso)
                                  : '—'}
                              </span>
                              <span className="text-[#5C5953]">→</span>
                              <span>
                                {liveEditPreview.newArrivalDateIso
                                  ? formatIsoDateDotRu(liveEditPreview.newArrivalDateIso)
                                  : '—'}
                              </span>
                            </div>
                            {shiftedArrivalWarningIso &&
                              shiftedArrivalWarningIso !== liveEditPreview.newArrivalDateIso && (
                                <div className="text-[10.5px] text-[#B91C1C] dark:text-rose-400">
                                  сдвиг оплаты смещает приход до{' '}
                                  <span className="font-mono font-semibold">
                                    {formatIsoDateDotRu(shiftedArrivalWarningIso)}
                                  </span>
                                </div>
                              )}
                          </div>
                        </div>

                        {liveEditPreview.newSupplyDeficits.length > 0 && (
                          <div className="rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 flex items-start gap-2 text-[11.5px] text-[#B91C1C] dark:text-rose-300">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>{liveEditPreview.newSupplyDeficits[0]!.message}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Быстрые действия: Перенести на следующий месяц + Разделить на части + Отменить ручную корректировку */}
                    {!isFactualPaidLocked && (
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
                    )}

                    {/* Режим разбиения платежа на несколько частей */}
                    {splitModeOpen && !isFactualPaidLocked && (
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

                    {/* Обязательное подтверждение переноса/правки согласованного заказа (Стр. 6 и 10 ТЗ v1.0) */}
                    {isApprovedPoGuard && (
                      <label
                        data-testid="inv-approved-po-guard"
                        className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2.5 cursor-pointer text-xs text-amber-950 dark:text-amber-200"
                      >
                        <input
                          type="checkbox"
                          data-testid="inv-confirm-approved-po-checkbox"
                          checked={lockedEditConfirmed}
                          onChange={(e) => setLockedEditConfirmed(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-amber-600 accent-[#141413] cursor-pointer shrink-0"
                        />
                        <div className="space-y-0.5">
                          <div className="font-semibold inline-flex items-center gap-1.5">
                            <ShieldAlert className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" />
                            <span>
                              Подтверждаю перенос согласованного заказа (будет записано в историю)
                            </span>
                          </div>
                          <div className="text-[11px] opacity-85">
                            Заказ подтверждён на фабрике — ручное изменение сохранится с отметкой автора и времени в журнале аудита.
                          </div>
                        </div>
                      </label>
                    )}

                    {/* Нижняя панель кнопок */}
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[#E4E1DA] dark:border-[#282724]">
                      <button
                        type="button"
                        onClick={() => setSelectedOpId(null)}
                        className="h-9 px-3.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] text-[#141413] dark:text-[#F5F4F0] text-xs font-medium cursor-pointer"
                      >
                        Отмена
                      </button>

                      {!isFactualPaidLocked && (
                        <button
                          type="button"
                          data-testid="inv-save-op-btn"
                          disabled={isApprovedPoGuard && !lockedEditConfirmed}
                          onClick={handleSaveSelectedPaymentInspector}
                          className="h-9 px-4 rounded-lg bg-[#141413] dark:bg-[#F5F4F0] text-white dark:text-[#141413] text-xs font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                        >
                          Применить корректировку
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {/* РАЗДЕЛ 8 ТЗ: ОДИН ОСНОВНОЙ ГРАФИК — «СВОБОДНЫЕ ДЕНЬГИ БИЗНЕСА» */}
      <div
        data-testid="business-free-cash-chart"
        className="card-elevated rounded-2xl border border-[#141413]/[0.07] dark:border-[#282724] bg-white dark:bg-[#151514] p-5 sm:p-6 shadow-[0_1px_2px_rgba(20,20,19,0.035),0_4px_12px_-4px_rgba(20,20,19,0.025)] space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div>
            <h3 className="text-[15.5px] font-semibold tracking-[-0.015em] text-[#141413] dark:text-[#F5F4F0]">
              Свободные деньги бизнеса · {selectedYear}
            </h3>
            <p className="mt-0.5 text-[12px] text-[#7A766E] dark:text-[#9A968E]">
              Выше нуля — доступный остаток после платежей и резерва. Ниже нуля — потребность в финансировании. Нажмите на месяц для детализации.
            </p>
          </div>
          <div className="flex items-center gap-4 text-[11.5px] text-[#6B6760] dark:text-[#9A968E]">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="h-2 w-2 rounded-full bg-[#0F766E] dark:bg-emerald-500" />
              <span>Свободные (&gt; 0)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="h-2 w-2 rounded-full bg-[#B91C1C] dark:bg-rose-500" />
              <span>Дефицит (&lt; 0)</span>
            </span>
          </div>
        </div>

        {/* Столбчатый график по 12 месяцам с нулевой осью */}
        <div className="rounded-xl border border-[#ECEAE3] dark:border-[#262522] bg-[#FAF9F6] dark:bg-[#191816] p-3.5 sm:p-4">
          <div className="grid grid-cols-12 gap-1 sm:gap-2">
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
                  className={`group rounded-xl p-1.5 flex flex-col items-center cursor-pointer transition-all ${
                    isSel
                      ? 'bg-white dark:bg-[#151514] ring-1 ring-[#141413]/25 dark:ring-[#F5F4F0]/30 shadow-[0_1px_3px_rgba(20,20,19,0.06)]'
                      : 'hover:bg-white/80 dark:hover:bg-[#151514]/70'
                  }`}
                >
                  <span
                    className={`font-display-num tabular-nums text-[10.5px] font-medium mb-1.5 whitespace-nowrap ${
                      isPos
                        ? 'text-[#0F766E] dark:text-emerald-400'
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
                        className="w-full max-w-[24px] rounded-t-md bg-[#0F766E] dark:bg-emerald-500 group-hover:opacity-90 transition-all"
                      />
                    )}
                  </div>

                  {/* Линия 0 ₽ */}
                  <div className="w-full h-px bg-[#D2CEC4] dark:bg-[#383632]" />

                  {/* Нижняя полуплоскость (< 0) */}
                  <div className="w-full h-16 flex items-start justify-center">
                    {!isPos && (
                      <div
                        style={{ height: `${ratioPct}%` }}
                        className="w-full max-w-[24px] rounded-b-md bg-[#B91C1C] dark:bg-rose-500 group-hover:opacity-90 transition-all"
                      />
                    )}
                  </div>

                  <span
                    className={`mt-2 text-[11px] font-medium ${
                      isSel
                        ? 'text-[#141413] dark:text-[#F5F4F0] font-semibold'
                        : 'text-[#7A766E] dark:text-[#9A968E]'
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
            className="rounded-xl border border-[#ECEAE3] dark:border-[#262522] bg-[#FAF8F4] dark:bg-[#191816] p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13.5px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                {selectedFreeCashRow.periodLabel} — движение денег
              </div>
              <button
                type="button"
                onClick={() => setSelectedFreeCashMonthIdx(null)}
                className="text-xs text-[#6B6760] hover:text-[#141413] dark:hover:text-[#F5F4F0] cursor-pointer"
              >
                Закрыть
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-xl border border-[#ECEAE3] dark:border-[#262522] bg-white dark:bg-[#151514] p-3">
                <div className="text-[#7A766E]">Поступления</div>
                <div className="mt-1">
                  <MoneyFigure
                    valueRub={selectedFreeCashRow.inflowsRub}
                    signed
                    className="text-[15px] font-semibold text-[#0F766E] dark:text-emerald-400"
                    unitClassName="!text-[#0F766E]/70 dark:!text-emerald-400/70"
                  />
                </div>
              </div>
              <div className="rounded-xl border border-[#ECEAE3] dark:border-[#262522] bg-white dark:bg-[#151514] p-3">
                <div className="text-[#7A766E]">Платежи</div>
                <div className="mt-1">
                  <MoneyFigure
                    valueRub={-selectedFreeCashRow.outflowsRub}
                    className="text-[15px] font-semibold text-[#141413] dark:text-[#F5F4F0]"
                  />
                </div>
              </div>
              <div className="rounded-xl border border-[#ECEAE3] dark:border-[#262522] bg-white dark:bg-[#151514] p-3">
                <div className="text-[#7A766E]">Собственные вложения</div>
                <div className="mt-1">
                  <MoneyFigure
                    valueRub={selectedFreeCashRow.userCapitalInjectionsRub}
                    signed={selectedFreeCashRow.userCapitalInjectionsRub > 0}
                    className="text-[15px] font-semibold text-[#141413] dark:text-[#F5F4F0]"
                  />
                </div>
              </div>
              <div className="rounded-xl border border-[#ECEAE3] dark:border-[#262522] bg-white dark:bg-[#151514] p-3">
                <div className="text-[#7A766E]">Остаток (свободные)</div>
                <div className="mt-1">
                  <MoneyFigure
                    valueRub={selectedFreeCashRow.businessFreeCashRub}
                    className={`text-[15px] font-semibold ${
                      selectedFreeCashRow.businessFreeCashRub >= 0
                        ? 'text-[#0F766E] dark:text-emerald-400'
                        : 'text-[#B91C1C] dark:text-rose-400'
                    }`}
                  />
                </div>
              </div>
            </div>

            {selectedFreeCashRow.events.length > 0 && (
              <div className="rounded-xl border border-[#ECEAE3] dark:border-[#262522] bg-white dark:bg-[#151514] divide-y divide-[#F0EDE6] dark:divide-[#242320] max-h-60 overflow-y-auto text-xs">
                {selectedFreeCashRow.events.map((ev) => (
                  <div
                    key={ev.id}
                    onClick={() => {
                      if (ev.type === 'factory_payment' || ev.type === 'other_expense') {
                        setSelectedOpId(ev.id);
                      }
                    }}
                    className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 hover:bg-[#FAF8F4] dark:hover:bg-[#1C1B18] cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-display-num tabular-nums text-[#7A766E] shrink-0">
                        {formatIsoDateDotRu(ev.dateIso)}
                      </span>
                      <span className="truncate font-medium text-[#141413] dark:text-[#F5F4F0]">
                        {ev.title}
                      </span>
                    </div>
                    <span
                      className={`font-display-num tabular-nums font-semibold shrink-0 whitespace-nowrap ${
                        ev.inflowRub > 0 || ev.userCapitalInjectionRub > 0
                          ? 'text-[#0F766E] dark:text-emerald-400'
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
        <div className="card-elevated rounded-2xl border border-[#141413]/[0.07] dark:border-[#282724] bg-white dark:bg-[#151514] p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[14.5px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
              История изменений плана инвестиций и платежей ({ledgerState.auditHistory.length})
            </div>
            <button
              type="button"
              onClick={() => setShowHistoryDrawer(false)}
              className="text-xs text-[#6B6760] hover:text-[#141413] cursor-pointer"
            >
              Закрыть
            </button>
          </div>
          {ledgerState.auditHistory.length === 0 ? (
            <p className="text-xs text-[#7A766E]">Ручных изменений пока не вносилось.</p>
          ) : (
            <div className="max-h-60 overflow-y-auto divide-y divide-[#F0EDE6] dark:divide-[#242320] border border-[#ECEAE3] dark:border-[#262522] rounded-xl text-xs">
              {ledgerState.auditHistory.map((h) => (
                <div key={h.id} className="p-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-[#141413] dark:text-[#F5F4F0]">
                      {h.operationTitle}
                    </div>
                    <div className="text-[#6B6760]">
                      {h.beforeValue} → <strong className="text-[#141413] dark:text-[#F5F4F0]">{h.afterValue}</strong>
                    </div>
                  </div>
                  <div className="font-display-num tabular-nums text-[11px] text-[#7A766E]">
                    {new Date(h.timestampIso).toLocaleString('ru-RU')} · {h.author}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* РАЗДЕЛЫ 3 И 8 ТЗ: СКРЫТЫЙ ПО УМОЛЧАНИЮ РАЗДЕЛ «ПОДРОБНАЯ АНАЛИТИКА» */}
      <div className="card-elevated rounded-2xl border border-[#141413]/[0.07] dark:border-[#282724] bg-white dark:bg-[#151514] overflow-hidden shadow-[0_1px_2px_rgba(20,20,19,0.03)]">
        <button
          type="button"
          data-testid="btn-toggle-detailed-analytics"
          onClick={() => setShowDetailedAnalytics((v) => !v)}
          className="w-full px-5 sm:px-6 py-4 flex items-center justify-between gap-3 text-left hover:bg-[#FAF8F4] dark:hover:bg-[#1C1B18] cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-[#F3F1EC] dark:bg-[#23221F] flex items-center justify-center shrink-0">
              <BarChart3 className="h-4 w-4 text-[#5C5953] dark:text-[#9A968E]" strokeWidth={1.6} />
            </div>
            <div>
              <div className="text-[14px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                Подробная аналитика
              </div>
              <div className="text-[12px] text-[#7A766E] dark:text-[#9A968E]">
                Помесячный календарь движения денег, операционные расходы, P&amp;L и дополнительные показатели
              </div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[#3D3A36] dark:text-[#F5F4F0] whitespace-nowrap">
            <span>{showDetailedAnalytics ? 'Свернуть' : 'Открыть'}</span>
            {showDetailedAnalytics ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
        </button>

        {showDetailedAnalytics && (
          <div className="p-5 sm:p-6 border-t border-[#F0EDE6] dark:border-[#242320] space-y-6">
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
                  <div className="rounded-xl border border-[#ECEAE3] dark:border-[#262522] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 text-xs items-end">
                    <label className="space-y-1">
                      <span className="text-[#6B6760]">Тип</span>
                      <select
                        value={opKind}
                        onChange={(e) => setOpKind(e.target.value as 'expense' | 'inflow')}
                        className="w-full h-8 px-2 rounded-lg border border-[#E4E1DA] bg-white dark:bg-[#151514]"
                      >
                        <option value="expense">Расход</option>
                        <option value="inflow">Поступление</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[#6B6760]">Категория</span>
                      <select
                        value={opCategory}
                        onChange={(e) =>
                          setOpCategory(e.target.value as CustomCashOperationRecord['category'])
                        }
                        className="w-full h-8 px-2 rounded-lg border border-[#E4E1DA] bg-white dark:bg-[#151514]"
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
                      <span className="text-[#6B6760]">Дата</span>
                      <input
                        type="date"
                        value={opDateIso}
                        onChange={(e) => setOpDateIso(e.target.value)}
                        className="w-full h-8 px-2 rounded-lg border border-[#E4E1DA] bg-white dark:bg-[#151514] font-display-num"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[#6B6760]">Сумма, млн ₽</span>
                      <input
                        type="number"
                        min={0.05}
                        step={0.1}
                        value={opAmountMln}
                        onChange={(e) => setOpAmountMln(e.target.value)}
                        className="w-full h-8 px-2 rounded-lg border border-[#E4E1DA] bg-white dark:bg-[#151514] font-display-num"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[#6B6760]">Назначение</span>
                      <input
                        type="text"
                        value={opTitle}
                        onChange={(e) => setOpTitle(e.target.value)}
                        className="w-full h-8 px-2 rounded-lg border border-[#E4E1DA] bg-white dark:bg-[#151514]"
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
                      className="h-8 px-3 rounded-lg bg-[#141413] text-white font-medium cursor-pointer"
                    >
                      Сохранить
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Полная помесячная таблица календаря движения денег */}
            <div className="space-y-2.5">
              <div className="text-[13.5px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                Помесячный календарь движения денег · {selectedYear}
              </div>
              <div className="overflow-x-auto rounded-xl border border-[#ECEAE3] dark:border-[#262522]">
                <table
                  data-testid="investment-calendar-table"
                  className="w-full min-w-[760px] border-collapse text-left text-[12.5px]"
                >
                  <thead>
                    <tr className="bg-[#FAF9F6] dark:bg-[#1A1917] border-b border-[#ECEAE3] dark:border-[#262522] text-[11px] uppercase tracking-[0.05em] text-[#7A766E]">
                      <th className="py-2.5 px-3.5 font-medium">Период</th>
                      <th className="py-2.5 px-3.5 font-medium text-right">Поступления</th>
                      <th className="py-2.5 px-3.5 font-medium text-right">Платежи</th>
                      <th className="py-2.5 px-3.5 font-medium text-right">Реинвестирование</th>
                      <th className="py-2.5 px-3.5 font-medium text-right">Нужно вложить</th>
                      <th className="py-2.5 px-3.5 font-medium text-right">Остаток</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0EDE6] dark:divide-[#242320]">
                    {schedule.monthlyCalendarRows.map((mRow) => {
                      const isOpen = expandedMonths.has(mRow.monthIdx);
                      return (
                        <React.Fragment key={mRow.monthIdx}>
                          <tr
                            data-testid={`inv-month-row-${mRow.monthIdx}`}
                            onClick={() => toggleMonthExpand(mRow.monthIdx)}
                            className="hover:bg-[#FAF8F4] dark:hover:bg-[#1C1B18] cursor-pointer transition-colors"
                          >
                            <td className="py-2.5 px-3.5 font-medium inline-flex items-center gap-1.5">
                              {isOpen ? (
                                <ChevronDown className="h-3.5 w-3.5 text-[#7A766E]" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-[#7A766E]" />
                              )}
                              <span>{mRow.periodLabel}</span>
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-display-num tabular-nums text-[#0F766E] dark:text-emerald-400 whitespace-nowrap">
                              {mRow.inflowsRub > 0 ? `+${fmtMln(mRow.inflowsRub)}` : '—'}
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-display-num tabular-nums whitespace-nowrap">
                              {mRow.outflowsRub > 0 ? `−${fmtMln(mRow.outflowsRub)}` : '—'}
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-display-num tabular-nums text-[#0F766E] dark:text-emerald-400 whitespace-nowrap">
                              {mRow.reinvestedRub > 0 ? fmtMln(mRow.reinvestedRub) : '—'}
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-display-num tabular-nums font-semibold text-[#B91C1C] dark:text-rose-400 whitespace-nowrap">
                              {mRow.needToInvestRub > 0 ? fmtMln(mRow.needToInvestRub) : '—'}
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-display-num tabular-nums whitespace-nowrap">
                              {fmtMln(mRow.endingFreeCashRub)}
                            </td>
                          </tr>
                          {isOpen &&
                            mRow.events.map((ev) => (
                              <tr
                                key={ev.id}
                                data-testid={`inv-event-row-${ev.type}`}
                                onClick={() => setSelectedOpId(ev.id)}
                                className="bg-[#FAF8F4]/70 dark:bg-[#191816] text-[11.5px] cursor-pointer"
                              >
                                <td className="py-2 pl-9 pr-3.5 font-display-num tabular-nums text-[#6B6760]">
                                  {formatIsoDateDotRu(ev.dateIso)} · {ev.title}
                                </td>
                                <td className="py-2 px-3.5 text-right font-display-num tabular-nums text-[#0F766E] dark:text-emerald-400 whitespace-nowrap">
                                  {ev.inflowRub > 0 ? `+${fmtMln(ev.inflowRub)}` : '—'}
                                </td>
                                <td className="py-2 px-3.5 text-right font-display-num tabular-nums whitespace-nowrap">
                                  {ev.outflowRub > 0 ? `−${fmtMln(ev.outflowRub)}` : '—'}
                                </td>
                                <td className="py-2 px-3.5 text-right font-display-num tabular-nums text-[#0F766E] dark:text-emerald-400 whitespace-nowrap">
                                  {ev.reinvestedFromSalesRub > 0
                                    ? fmtMln(ev.reinvestedFromSalesRub)
                                    : '—'}
                                </td>
                                <td className="py-2 px-3.5 text-right font-display-num tabular-nums text-[#B91C1C] dark:text-rose-400 whitespace-nowrap">
                                  {ev.needToInvestRub > 0 ? fmtMln(ev.needToInvestRub) : '—'}
                                </td>
                                <td className="py-2 px-3.5 text-right font-display-num tabular-nums whitespace-nowrap">
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
