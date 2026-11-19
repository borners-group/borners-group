'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GrowthScenarioDef, ScenarioModelSpec } from '@/lib/scenarioData';
import {
  type CanonicalBrandCode,
  isCombinedBornersFukaiFilter,
  normalizePortfolioBrandCode,
} from '@/lib/unifiedBusinessEngine';
import {
  type BatchTermsManualOverride,
  type CapitalInjectionRecord,
  type ComputeInvestmentScheduleParams,
  type ComputedInvestmentScheduleResult,
  type CustomCashOperationRecord,
  type DraftPaymentOrBatchEditPatch,
  type GroupCapitalMode,
  type HoldingGroupOverviewSummary,
  type InvestmentLedgerGlobalSettings,
  type InvestmentLedgerState,
  type ManualPaymentOverride,
  type PaymentOrBatchEditPreviewResult,
  type PlanComparisonWithBaseline,
  type ResetToAutoPlanPreview,
  appendLedgerAudit,
  applyResetScenarioToAutoPlan,
  computeHoldingBrandsOverviewRows,
  computeInvestmentSchedule,
  computePlanComparisonWithAutoBaseline,
  computeResetToAutoPlanPreview,
  createDefaultInvestmentLedgerState,
  ensureScenarioPlanSlot,
  formatIsoDateHumanRu,
  loadInvestmentLedgerState,
  previewPaymentOrBatchEdit,
  saveInvestmentLedgerState,
} from '@/lib/investmentScheduleEngine';

export type InvestmentSaveIndicatorStatus = 'saved_cloud' | 'saving' | 'saved_local';

export interface UseInvestmentScheduleParams {
  models: ScenarioModelSpec[];
  scenarios: GrowthScenarioDef[];
  activeScenario: GrowthScenarioDef;
  brandFilter?: string;
  selectedScenarioByBrand?: Partial<
    Record<CanonicalBrandCode | 'BORNERS_FUKAI' | 'LISCANI', number | null>
  >;
  includeGroupPortfolioInS1?: boolean;
  explicitInitialCashRub?: number;
  explicitWbLagMonths?: number | null;
  explicitWbScheduleSpecified?: boolean;
  targetYear?: 2027 | 2028;
  groupCapitalMode?: GroupCapitalMode;
}

function normalizeScopeKeyForLedger(rawScopeKey: string | undefined, fallbackScopeKey: string): string {
  if (!rawScopeKey || rawScopeKey === 'SHARED') return fallbackScopeKey;
  if (/^BORNERS_FUKAI:/i.test(rawScopeKey)) {
    return rawScopeKey.replace(/^BORNERS_FUKAI:/i, 'BORNERS:');
  }
  return rawScopeKey;
}

export function useInvestmentSchedule(params: UseInvestmentScheduleParams) {
  const [ledgerState, setLedgerState] = useState<InvestmentLedgerState>(() =>
    createDefaultInvestmentLedgerState()
  );
  const [saveStatus, setSaveStatus] = useState<InvestmentSaveIndicatorStatus>('saved_cloud');
  const [lastSavedAtIso, setLastSavedAtIso] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncLedger = () => {
      const loaded = loadInvestmentLedgerState();
      setLedgerState(loaded);
      if (loaded.updatedAtIso) {
        setLastSavedAtIso(loaded.updatedAtIso);
      }
    };
    const handleCloudStatus = (ev: Event) => {
      const detail = (ev as CustomEvent<{ status?: InvestmentSaveIndicatorStatus; atIso?: string }>)
        ?.detail;
      if (detail?.status) {
        setSaveStatus(detail.status);
      }
      if (detail?.atIso) {
        setLastSavedAtIso(detail.atIso);
      }
    };
    syncLedger();
    window.addEventListener('borners-investment-ledger-changed', syncLedger);
    window.addEventListener('borners-finance-params-changed', syncLedger);
    window.addEventListener('borners-cloud-save-status', handleCloudStatus);
    window.addEventListener('storage', syncLedger);
    return () => {
      window.removeEventListener('borners-investment-ledger-changed', syncLedger);
      window.removeEventListener('borners-finance-params-changed', syncLedger);
      window.removeEventListener('borners-cloud-save-status', handleCloudStatus);
      window.removeEventListener('storage', syncLedger);
    };
  }, []);

  const selectedYear: 2027 | 2028 =
    params.targetYear ||
    (ledgerState.globalSettings.selectedFinanceYear === 2028 ? 2028 : 2027);

  const groupCapitalMode: GroupCapitalMode =
    params.groupCapitalMode ||
    (ledgerState.globalSettings.groupCapitalMode === 'per_brand'
      ? 'per_brand'
      : 'common_pool');

  const currentComputeParams: ComputeInvestmentScheduleParams = useMemo(
    () => ({
      models: params.models,
      scenarios: params.scenarios,
      activeScenario: params.activeScenario,
      brandFilter: params.brandFilter,
      selectedScenarioByBrand: params.selectedScenarioByBrand,
      includeGroupPortfolioInS1: params.includeGroupPortfolioInS1,
      ledgerState,
      explicitInitialCashRub: params.explicitInitialCashRub,
      explicitWbLagMonths: params.explicitWbLagMonths,
      explicitWbScheduleSpecified: params.explicitWbScheduleSpecified,
      targetYear: params.targetYear,
      groupCapitalMode,
      combineBornersAndFukai: true,
    }),
    [
      params.models,
      params.scenarios,
      params.activeScenario,
      params.brandFilter,
      params.selectedScenarioByBrand,
      params.includeGroupPortfolioInS1,
      params.explicitInitialCashRub,
      params.explicitWbLagMonths,
      params.explicitWbScheduleSpecified,
      params.targetYear,
      groupCapitalMode,
      ledgerState,
    ]
  );

  const schedule: ComputedInvestmentScheduleResult = useMemo(
    () => computeInvestmentSchedule(currentComputeParams),
    [currentComputeParams]
  );

  const previewEdit = useCallback(
    (draftPatch: DraftPaymentOrBatchEditPatch): PaymentOrBatchEditPreviewResult =>
      previewPaymentOrBatchEdit(currentComputeParams, draftPatch),
    [currentComputeParams]
  );

  const planComparison: PlanComparisonWithBaseline = useMemo(
    () => computePlanComparisonWithAutoBaseline(currentComputeParams, schedule),
    [currentComputeParams, schedule]
  );

  const holdingOverview: HoldingGroupOverviewSummary | null = useMemo(() => {
    const isAll = !params.brandFilter || params.brandFilter === 'ALL';
    if (!isAll) return null;
    return computeHoldingBrandsOverviewRows(
      {
        models: params.models,
        scenarios: params.scenarios,
        activeScenario: params.activeScenario,
        selectedScenarioByBrand: params.selectedScenarioByBrand,
        includeGroupPortfolioInS1: params.includeGroupPortfolioInS1,
        ledgerState,
        explicitInitialCashRub: params.explicitInitialCashRub,
        explicitWbLagMonths: params.explicitWbLagMonths,
        explicitWbScheduleSpecified: params.explicitWbScheduleSpecified,
        targetYear: params.targetYear,
        groupCapitalMode,
        combineBornersAndFukai: true,
      },
      schedule
    );
  }, [
    params.brandFilter,
    params.models,
    params.scenarios,
    params.activeScenario,
    params.selectedScenarioByBrand,
    params.includeGroupPortfolioInS1,
    params.explicitInitialCashRub,
    params.explicitWbLagMonths,
    params.explicitWbScheduleSpecified,
    params.targetYear,
    groupCapitalMode,
    ledgerState,
    schedule,
  ]);

  const activeCapitalInjections: CapitalInjectionRecord[] = useMemo(() => {
    const list: CapitalInjectionRecord[] = [];
    const seen = new Set<string>();
    const groupKey = schedule.scenarioYear === 2028 ? 'GROUP:ALL@2028' : 'GROUP:ALL';
    const isCombinedBF = isCombinedBornersFukaiFilter(params.brandFilter);
    const normFilter =
      !params.brandFilter || params.brandFilter === 'ALL'
        ? 'ALL'
        : normalizePortfolioBrandCode(params.brandFilter);
    for (const inj of ledgerState.sharedCommitted.committedCapitalInjections || []) {
      if (!schedule.isGroupAllBrands && inj.brandCode && inj.brandCode !== 'ALL') {
        const matchesBrand = isCombinedBF
          ? inj.brandCode === 'BORNERS' ||
            inj.brandCode === 'FUKAI' ||
            isCombinedBornersFukaiFilter(inj.brandCode)
          : normalizePortfolioBrandCode(inj.brandCode) === normFilter;
        if (!matchesBrand) {
          continue;
        }
      }
      const m = (inj.dateIso || '').trim().match(/^(\d{4})-(\d{2})/);
      if (m) {
        const yr = Number(m[1]);
        const mo = Number(m[2]);
        const valid =
          yr === schedule.scenarioYear || (yr === schedule.scenarioYear - 1 && mo >= 9);
        if (!valid) continue;
      }
      if (!seen.has(inj.id)) {
        seen.add(inj.id);
        list.push(inj);
      }
    }
    const scopes = schedule.isGroupAllBrands
      ? Object.keys(ledgerState.scenarioPlans).filter((k) =>
          schedule.scenarioYear === 2028 ? k.endsWith('@2028') : !k.endsWith('@2028')
        )
      : Array.from(
          new Set([...(schedule.activeScopeKeys || [schedule.activeScopeKey]), groupKey])
        );
    for (const sk of scopes) {
      for (const inj of ledgerState.scenarioPlans[sk]?.plannedCapitalInjections || []) {
        if (!seen.has(inj.id)) {
          seen.add(inj.id);
          list.push(inj);
        }
      }
    }
    return list.sort((a, b) => (a.dateIso < b.dateIso ? -1 : a.dateIso > b.dateIso ? 1 : 0));
  }, [
    ledgerState,
    params.brandFilter,
    schedule.activeScopeKey,
    schedule.activeScopeKeys,
    schedule.isGroupAllBrands,
    schedule.scenarioYear,
  ]);

  const resetPreview: ResetToAutoPlanPreview = useMemo(
    () => computeResetToAutoPlanPreview(schedule, ledgerState),
    [schedule, ledgerState]
  );

  const commitNextLedger = useCallback((next: InvestmentLedgerState) => {
    setSaveStatus('saving');
    const saved = saveInvestmentLedgerState(next, { syncFinanceParams: true });
    setLedgerState(saved);
    setLastSavedAtIso(saved.updatedAtIso);
    // В локальном/автономном режиме через 550 мс подтверждаем локальное сохранение, если облако ещё не прислало saved_cloud
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        setSaveStatus((prev) => (prev === 'saving' ? 'saved_local' : prev));
      }, 550);
    }
    return saved;
  }, []);

  const updateGlobalSettings = useCallback(
    (patch: Partial<InvestmentLedgerGlobalSettings>, author = 'Владелец') => {
      const current = loadInvestmentLedgerState();
      const prevGs = current.globalSettings;
      const nextGs: InvestmentLedgerGlobalSettings = {
        ...prevGs,
        ...patch,
      };
      const beforeParts: string[] = [];
      const afterParts: string[] = [];
      if (patch.initialCashRub !== undefined && patch.initialCashRub !== prevGs.initialCashRub) {
        beforeParts.push(`Капитал: ${prevGs.initialCashRub.toLocaleString('ru-RU')} ₽`);
        afterParts.push(`Капитал: ${nextGs.initialCashRub.toLocaleString('ru-RU')} ₽`);
      }
      if (
        patch.minCashReserveRub !== undefined &&
        patch.minCashReserveRub !== prevGs.minCashReserveRub
      ) {
        beforeParts.push(`Резерв: ${prevGs.minCashReserveRub.toLocaleString('ru-RU')} ₽`);
        afterParts.push(`Резерв: ${nextGs.minCashReserveRub.toLocaleString('ru-RU')} ₽`);
      }
      if (
        (patch.wbPayoutDelayDays !== undefined &&
          patch.wbPayoutDelayDays !== prevGs.wbPayoutDelayDays) ||
        (patch.wbPayoutScheduleSpecified !== undefined &&
          patch.wbPayoutScheduleSpecified !== prevGs.wbPayoutScheduleSpecified)
      ) {
        beforeParts.push(
          prevGs.wbPayoutScheduleSpecified
            ? `Лаг WB: ${prevGs.wbPayoutDelayDays} дн.`
            : 'Лаг WB: не задан'
        );
        afterParts.push(
          nextGs.wbPayoutScheduleSpecified
            ? `Лаг WB: ${nextGs.wbPayoutDelayDays} дн.`
            : 'Лаг WB: не задан'
        );
      }
      if (
        patch.groupCapitalMode !== undefined &&
        patch.groupCapitalMode !== (prevGs.groupCapitalMode || 'common_pool')
      ) {
        beforeParts.push(
          prevGs.groupCapitalMode === 'per_brand'
            ? 'Режим группы: Каждый бренд сам'
            : 'Режим группы: Общий котёл'
        );
        afterParts.push(
          nextGs.groupCapitalMode === 'per_brand'
            ? 'Режим группы: Каждый бренд сам'
            : 'Режим группы: Общий котёл'
        );
      }

      const nextState: InvestmentLedgerState = {
        ...current,
        globalSettings: nextGs,
        auditHistory:
          afterParts.length > 0
            ? appendLedgerAudit(current, {
                author,
                scenarioScopeKey: schedule.activeScopeKey,
                operationTitle: 'Исходные условия капитала и выплат WB',
                actionType: 'edit_global_params',
                beforeValue: beforeParts.join(' · '),
                afterValue: afterParts.join(' · '),
              })
            : current.auditHistory,
      };
      commitNextLedger(nextState);
    },
    [commitNextLedger, schedule.activeScopeKey]
  );

  const updatePaymentOperation = useCallback(
    (input: {
      opKey: string;
      batchKey: string;
      scenarioScopeKey: string;
      isApprovedPo: boolean;
      currentTitle: string;
      beforeSummary: string;
      patch: Partial<
        Omit<ManualPaymentOverride, 'opKey' | 'batchKey' | 'updatedAtIso' | 'updatedBy'>
      >;
      author?: string;
    }) => {
      const author = input.author || 'Владелец';
      const current = loadInvestmentLedgerState();
      const targetScope = normalizeScopeKeyForLedger(
        input.scenarioScopeKey,
        schedule.activeScopeKey
      );

      const existingCommitted = current.sharedCommitted.committedPaymentOverrides[input.opKey];
      const existingScen = current.scenarioPlans[targetScope]?.paymentOverrides?.[input.opKey];
      const baseOvr = existingCommitted || existingScen;

      const hasDepositPctPatch = 'depositPct' in input.patch;
      const clampedDepositPct =
        input.patch.depositPct !== undefined
          ? Math.max(0, Math.min(100, Math.round(input.patch.depositPct)))
          : undefined;
      const hasCustomAmountPatch = 'customAmountRub' in input.patch;

      // При явной смене процента предоплаты очищаем устаревший ручной customAmountRub (если не передан явно)
      // и наоборот — при явной смене суммы очищаем устаревший depositPct, чтобы инвариант аванс + доплата = цена PO работал чисто.
      const resolvedDepositPct = hasDepositPctPatch
        ? clampedDepositPct
        : hasCustomAmountPatch && input.patch.customAmountRub !== undefined
        ? undefined
        : baseOvr?.depositPct;

      const resolvedCustomAmountRub = hasCustomAmountPatch
        ? input.patch.customAmountRub
        : clampedDepositPct !== undefined
        ? undefined
        : baseOvr?.customAmountRub;

      const mergedOvr: ManualPaymentOverride = {
        opKey: input.opKey,
        batchKey: input.batchKey,
        customDateIso:
          'customDateIso' in input.patch ? input.patch.customDateIso : baseOvr?.customDateIso,
        customAmountRub: resolvedCustomAmountRub,
        depositPct: resolvedDepositPct,
        balanceDateIso:
          'balanceDateIso' in input.patch
            ? input.patch.balanceDateIso
            : baseOvr?.balanceDateIso,
        customFactoryName:
          'customFactoryName' in input.patch
            ? input.patch.customFactoryName
            : baseOvr?.customFactoryName,
        status: 'status' in input.patch ? input.patch.status : baseOvr?.status,
        splitTranches:
          'splitTranches' in input.patch ? input.patch.splitTranches : baseOvr?.splitTranches,
        note: 'note' in input.patch ? input.patch.note : baseOvr?.note,
        updatedAtIso: new Date().toISOString(),
        updatedBy: author,
      };

      const shouldStoreShared =
        input.isApprovedPo ||
        mergedOvr.status === 'Утверждено' ||
        mergedOvr.status === 'Оплачено' ||
        (mergedOvr.splitTranches || []).some(
          (t) => t.status === 'Утверждено' || t.status === 'Оплачено'
        );

      const nextCommittedMap = { ...current.sharedCommitted.committedPaymentOverrides };
      const nextCommittedBatch = { ...current.sharedCommitted.committedBatchOverrides };
      const nextScenarioPlans = { ...current.scenarioPlans };
      const slot = ensureScenarioPlanSlot(current, targetScope);

      if (shouldStoreShared) {
        nextCommittedMap[input.opKey] = mergedOvr;
        delete slot.paymentOverrides[input.opKey];
      } else {
        delete nextCommittedMap[input.opKey];
        slot.paymentOverrides[input.opKey] = mergedOvr;
      }

      // Синхронизация инварианта аванс + доплата = полная цена партии (Тест 04 ТЗ v1.0):
      // При редактировании % предоплаты обновляем batchOverrides[batchKey].customPrepaymentPct
      // и сбрасываем устаревший customAmountRub на связанной доплате, чтобы движок автоматически пересчитал доплату.
      if (input.batchKey && clampedDepositPct !== undefined) {
        const existingCommittedB = nextCommittedBatch[input.batchKey];
        const existingScenB = slot.batchOverrides[input.batchKey];
        const baseB = existingCommittedB || existingScenB;
        const syncedBatch: BatchTermsManualOverride = {
          ...baseB,
          batchKey: input.batchKey,
          customPrepaymentPct: clampedDepositPct,
          updatedAtIso: mergedOvr.updatedAtIso,
          updatedBy: author,
        };
        if (input.isApprovedPo || Boolean(existingCommittedB)) {
          nextCommittedBatch[input.batchKey] = syncedBatch;
        } else {
          slot.batchOverrides[input.batchKey] = syncedBatch;
        }
      }

      if (
        input.batchKey &&
        (clampedDepositPct !== undefined ||
          (input.opKey.endsWith('::prepay') && input.patch.customAmountRub !== undefined))
      ) {
        const balanceOpKey = `${input.batchKey}::balance`;
        if (balanceOpKey !== input.opKey) {
          const cleanBalanceAmount = (ovr: ManualPaymentOverride | undefined) => {
            if (!ovr || (ovr.splitTranches && ovr.splitTranches.length > 0)) return ovr;
            if (ovr.customAmountRub === undefined) return ovr;
            return {
              ...ovr,
              customAmountRub: undefined,
              updatedAtIso: mergedOvr.updatedAtIso,
              updatedBy: author,
            };
          };
          if (nextCommittedMap[balanceOpKey]) {
            nextCommittedMap[balanceOpKey] = cleanBalanceAmount(nextCommittedMap[balanceOpKey])!;
          }
          if (slot.paymentOverrides[balanceOpKey]) {
            slot.paymentOverrides[balanceOpKey] = cleanBalanceAmount(
              slot.paymentOverrides[balanceOpKey]
            )!;
          }
        }
      }

      nextScenarioPlans[targetScope] = slot;

      const afterParts: string[] = [];
      if (mergedOvr.splitTranches && mergedOvr.splitTranches.length > 0) {
        afterParts.push(
          `Разбит на ${mergedOvr.splitTranches.length} ч. (${mergedOvr.splitTranches
            .map((t) => `${formatIsoDateHumanRu(t.dateIso)}: ${t.amountRub.toLocaleString('ru-RU')} ₽`)
            .join(', ')})`
        );
      } else {
        if (mergedOvr.customDateIso) {
          afterParts.push(`Дата: ${formatIsoDateHumanRu(mergedOvr.customDateIso)}`);
        }
        if (mergedOvr.depositPct !== undefined) {
          afterParts.push(
            `Аванс/Доплата: ${mergedOvr.depositPct}% / ${100 - mergedOvr.depositPct}%`
          );
        }
        if (mergedOvr.customAmountRub !== undefined) {
          afterParts.push(`Сумма: ${mergedOvr.customAmountRub.toLocaleString('ru-RU')} ₽`);
        }
      }
      if (mergedOvr.balanceDateIso) {
        afterParts.push(`Доплата к: ${formatIsoDateHumanRu(mergedOvr.balanceDateIso)}`);
      }
      if (mergedOvr.customFactoryName) {
        afterParts.push(`Поставщик: ${mergedOvr.customFactoryName}`);
      }
      if (mergedOvr.status) {
        afterParts.push(`Статус: ${mergedOvr.status}`);
      }

      const actionType =
        input.patch.splitTranches !== undefined
          ? 'split_payment'
          : clampedDepositPct !== undefined
          ? 'edit_terms'
          : input.patch.status !== undefined
          ? 'status_change'
          : input.patch.customDateIso !== undefined
          ? 'edit_date'
          : input.patch.customFactoryName !== undefined
          ? 'edit_supplier'
          : 'edit_amount';

      commitNextLedger({
        ...current,
        sharedCommitted: {
          ...current.sharedCommitted,
          committedPaymentOverrides: nextCommittedMap,
          committedBatchOverrides: nextCommittedBatch,
        },
        scenarioPlans: nextScenarioPlans,
        auditHistory: appendLedgerAudit(current, {
          author,
          scenarioScopeKey: targetScope,
          operationTitle: input.currentTitle,
          actionType,
          beforeValue: input.beforeSummary,
          afterValue: afterParts.join(' · ') || 'Обновлено',
        }),
      });
    },
    [commitNextLedger, schedule.activeScopeKey]
  );

  const updateBatchTerms = useCallback(
    (input: {
      batchKey: string;
      scenarioScopeKey: string;
      isApprovedPo: boolean;
      batchTitle: string;
      beforeSummary: string;
      patch: Partial<
        Omit<BatchTermsManualOverride, 'batchKey' | 'updatedAtIso' | 'updatedBy'>
      >;
      author?: string;
    }) => {
      const author = input.author || 'Владелец';
      const current = loadInvestmentLedgerState();
      const targetScope = normalizeScopeKeyForLedger(
        input.scenarioScopeKey,
        schedule.activeScopeKey
      );

      const existingCommitted = current.sharedCommitted.committedBatchOverrides[input.batchKey];
      const existingScen = current.scenarioPlans[targetScope]?.batchOverrides?.[input.batchKey];
      const baseB = existingCommitted || existingScen;

      const clampedPrepayPct =
        input.patch.customPrepaymentPct !== undefined
          ? Math.max(0, Math.min(100, Math.round(input.patch.customPrepaymentPct)))
          : undefined;

      const nowIso = new Date().toISOString();
      const merged: BatchTermsManualOverride = {
        batchKey: input.batchKey,
        customPrepaymentPct:
          clampedPrepayPct !== undefined ? clampedPrepayPct : baseB?.customPrepaymentPct,
        customFactoryName:
          input.patch.customFactoryName !== undefined
            ? input.patch.customFactoryName
            : baseB?.customFactoryName,
        customArrivalDateIso:
          input.patch.customArrivalDateIso !== undefined
            ? input.patch.customArrivalDateIso
            : baseB?.customArrivalDateIso,
        customOrderDateIso:
          input.patch.customOrderDateIso !== undefined
            ? input.patch.customOrderDateIso
            : baseB?.customOrderDateIso,
        customPacksQty:
          input.patch.customPacksQty !== undefined
            ? input.patch.customPacksQty
            : baseB?.customPacksQty,
        updatedAtIso: nowIso,
        updatedBy: author,
      };

      const nextCommittedBatch = { ...current.sharedCommitted.committedBatchOverrides };
      const nextCommittedPay = { ...current.sharedCommitted.committedPaymentOverrides };
      const nextScenarioPlans = { ...current.scenarioPlans };
      const slot = ensureScenarioPlanSlot(current, targetScope);

      if (input.isApprovedPo || Boolean(existingCommitted)) {
        nextCommittedBatch[input.batchKey] = merged;
      } else {
        slot.batchOverrides[input.batchKey] = merged;
      }

      // При изменении % предоплаты или объёма партии синхронизируем связанные paymentOverrides,
      // чтобы старый ручной customAmountRub или старый depositPct не перекрывал новый расчёт аванса и доплаты!
      if (clampedPrepayPct !== undefined || input.patch.customPacksQty !== undefined) {
        const prepayOpKey = `${input.batchKey}::prepay`;
        const balanceOpKey = `${input.batchKey}::balance`;
        const sanitizePayOvr = (
          ovr: ManualPaymentOverride | undefined,
          isPrepay: boolean
        ): ManualPaymentOverride | undefined => {
          if (!ovr || (ovr.splitTranches && ovr.splitTranches.length > 0)) return ovr;
          return {
            ...ovr,
            customAmountRub: undefined,
            ...(isPrepay && clampedPrepayPct !== undefined
              ? { depositPct: clampedPrepayPct }
              : {}),
            updatedAtIso: nowIso,
            updatedBy: author,
          };
        };

        if (nextCommittedPay[prepayOpKey]) {
          nextCommittedPay[prepayOpKey] = sanitizePayOvr(nextCommittedPay[prepayOpKey], true)!;
        }
        if (slot.paymentOverrides[prepayOpKey]) {
          slot.paymentOverrides[prepayOpKey] = sanitizePayOvr(
            slot.paymentOverrides[prepayOpKey],
            true
          )!;
        }
        if (nextCommittedPay[balanceOpKey]) {
          nextCommittedPay[balanceOpKey] = sanitizePayOvr(nextCommittedPay[balanceOpKey], false)!;
        }
        if (slot.paymentOverrides[balanceOpKey]) {
          slot.paymentOverrides[balanceOpKey] = sanitizePayOvr(
            slot.paymentOverrides[balanceOpKey],
            false
          )!;
        }
      }

      nextScenarioPlans[targetScope] = slot;

      const afterParts: string[] = [];
      if (merged.customPacksQty !== undefined) {
        afterParts.push(`Объём партии: ${merged.customPacksQty.toLocaleString('ru-RU')} ед.`);
      }
      if (merged.customPrepaymentPct !== undefined) {
        afterParts.push(
          `Аванс/Доплата: ${merged.customPrepaymentPct}% / ${100 - merged.customPrepaymentPct}%`
        );
      }
      if (merged.customArrivalDateIso) {
        afterParts.push(`Поставка: ${formatIsoDateHumanRu(merged.customArrivalDateIso)}`);
      }
      if (merged.customFactoryName) {
        afterParts.push(`Поставщик: ${merged.customFactoryName}`);
      }

      commitNextLedger({
        ...current,
        sharedCommitted: {
          ...current.sharedCommitted,
          committedPaymentOverrides: nextCommittedPay,
          committedBatchOverrides: nextCommittedBatch,
        },
        scenarioPlans: nextScenarioPlans,
        auditHistory: appendLedgerAudit(current, {
          author,
          scenarioScopeKey: targetScope,
          operationTitle: input.batchTitle,
          actionType:
            input.patch.customArrivalDateIso !== undefined ? 'edit_arrival' : 'edit_terms',
          beforeValue: input.beforeSummary,
          afterValue: afterParts.join(' · ') || 'Обновлены условия партии',
        }),
      });
    },
    [commitNextLedger, schedule.activeScopeKey]
  );

  const undoOperationOverride = useCallback(
    (input: {
      opKey: string;
      batchKey?: string;
      scenarioScopeKey: string;
      operationTitle: string;
      author?: string;
    }) => {
      const author = input.author || 'Владелец';
      const current = loadInvestmentLedgerState();
      const nextCommittedPay = { ...current.sharedCommitted.committedPaymentOverrides };
      const nextCommittedBatch = { ...current.sharedCommitted.committedBatchOverrides };
      delete nextCommittedPay[input.opKey];
      if (input.batchKey) {
        delete nextCommittedBatch[input.batchKey];
      }

      const nextPlans = { ...current.scenarioPlans };
      for (const sk of Object.keys(nextPlans)) {
        const slot = ensureScenarioPlanSlot(current, sk);
        delete slot.paymentOverrides[input.opKey];
        if (input.batchKey) {
          delete slot.batchOverrides[input.batchKey];
        }
        nextPlans[sk] = slot;
      }

      commitNextLedger({
        ...current,
        sharedCommitted: {
          ...current.sharedCommitted,
          committedPaymentOverrides: nextCommittedPay,
          committedBatchOverrides: nextCommittedBatch,
        },
        scenarioPlans: nextPlans,
        auditHistory: appendLedgerAudit(current, {
          author,
          scenarioScopeKey: input.scenarioScopeKey || schedule.activeScopeKey,
          operationTitle: input.operationTitle,
          actionType: 'undo_override',
          beforeValue: 'Ручная корректировка операции',
          afterValue: 'Возвращено к автоматическому расчёту партии',
        }),
      });
    },
    [commitNextLedger, schedule.activeScopeKey]
  );

  const saveCapitalInjection = useCallback(
    (
      item: Omit<CapitalInjectionRecord, 'updatedAtIso' | 'updatedBy'>,
      scopeKey?: string,
      author = 'Владелец'
    ) => {
      const current = loadInvestmentLedgerState();
      const targetScope = normalizeScopeKeyForLedger(scopeKey, schedule.activeScopeKey);
      const record: CapitalInjectionRecord = {
        ...item,
        amountRub: Math.max(0, Math.round(item.amountRub)),
        updatedAtIso: new Date().toISOString(),
        updatedBy: author,
      };
      const isShared = record.status === 'Утверждено' || record.status === 'Оплачено';

      const nextCommitted = current.sharedCommitted.committedCapitalInjections.filter(
        (x) => x.id !== record.id
      );
      const nextPlans = { ...current.scenarioPlans };
      for (const sk of Object.keys(nextPlans)) {
        const sl = ensureScenarioPlanSlot(current, sk);
        sl.plannedCapitalInjections = sl.plannedCapitalInjections.filter(
          (x) => x.id !== record.id
        );
        nextPlans[sk] = sl;
      }

      if (isShared) {
        nextCommitted.push(record);
      } else {
        const slot = nextPlans[targetScope] || ensureScenarioPlanSlot(current, targetScope);
        slot.plannedCapitalInjections = [...slot.plannedCapitalInjections, record];
        nextPlans[targetScope] = slot;
      }

      commitNextLedger({
        ...current,
        sharedCommitted: {
          ...current.sharedCommitted,
          committedCapitalInjections: nextCommitted,
        },
        scenarioPlans: nextPlans,
        auditHistory: appendLedgerAudit(current, {
          author,
          scenarioScopeKey: targetScope,
          operationTitle: record.title || 'Собственная инвестиция',
          actionType: 'add_investment',
          beforeValue: '—',
          afterValue: `${formatIsoDateHumanRu(record.dateIso)} · +${record.amountRub.toLocaleString('ru-RU')} ₽ (${record.status})`,
        }),
      });
    },
    [commitNextLedger, schedule.activeScopeKey]
  );

  const removeCapitalInjection = useCallback(
    (id: string, title: string, author = 'Владелец') => {
      const current = loadInvestmentLedgerState();
      const cleanId = id.replace(/^cap-inj::/, '').replace(/^cap-inj-/, '');
      const nextCommitted = current.sharedCommitted.committedCapitalInjections.filter(
        (x) => x.id !== cleanId
      );
      const nextPlans = { ...current.scenarioPlans };
      for (const sk of Object.keys(nextPlans)) {
        const sl = ensureScenarioPlanSlot(current, sk);
        sl.plannedCapitalInjections = sl.plannedCapitalInjections.filter(
          (x) => x.id !== cleanId
        );
        nextPlans[sk] = sl;
      }
      commitNextLedger({
        ...current,
        sharedCommitted: {
          ...current.sharedCommitted,
          committedCapitalInjections: nextCommitted,
        },
        scenarioPlans: nextPlans,
        auditHistory: appendLedgerAudit(current, {
          author,
          scenarioScopeKey: schedule.activeScopeKey,
          operationTitle: title,
          actionType: 'delete_operation',
          beforeValue: title,
          afterValue: 'Удалено',
        }),
      });
    },
    [commitNextLedger, schedule.activeScopeKey]
  );

  const saveCustomCashOperation = useCallback(
    (
      item: Omit<CustomCashOperationRecord, 'updatedAtIso' | 'updatedBy'>,
      scopeKey?: string,
      author = 'Владелец'
    ) => {
      const current = loadInvestmentLedgerState();
      const targetScope = normalizeScopeKeyForLedger(scopeKey, schedule.activeScopeKey);
      const record: CustomCashOperationRecord = {
        ...item,
        amountRub: Math.max(0, Math.round(item.amountRub)),
        updatedAtIso: new Date().toISOString(),
        updatedBy: author,
      };
      const isShared = record.status === 'Утверждено' || record.status === 'Оплачено';

      const nextCommitted = current.sharedCommitted.committedOtherOperations.filter(
        (x) => x.id !== record.id
      );
      const nextPlans = { ...current.scenarioPlans };
      for (const sk of Object.keys(nextPlans)) {
        const sl = ensureScenarioPlanSlot(current, sk);
        sl.plannedOtherOperations = sl.plannedOtherOperations.filter(
          (x) => x.id !== record.id
        );
        nextPlans[sk] = sl;
      }

      if (isShared) {
        nextCommitted.push(record);
      } else {
        const slot = nextPlans[targetScope] || ensureScenarioPlanSlot(current, targetScope);
        slot.plannedOtherOperations = [...slot.plannedOtherOperations, record];
        nextPlans[targetScope] = slot;
      }

      commitNextLedger({
        ...current,
        sharedCommitted: {
          ...current.sharedCommitted,
          committedOtherOperations: nextCommitted,
        },
        scenarioPlans: nextPlans,
        auditHistory: appendLedgerAudit(current, {
          author,
          scenarioScopeKey: targetScope,
          operationTitle: record.title,
          actionType: 'add_operation',
          beforeValue: '—',
          afterValue: `${formatIsoDateHumanRu(record.dateIso)} · ${record.kind === 'inflow' ? '+' : '−'}${record.amountRub.toLocaleString('ru-RU')} ₽ (${record.status})`,
        }),
      });
    },
    [commitNextLedger, schedule.activeScopeKey]
  );

  const removeCustomCashOperation = useCallback(
    (id: string, title: string, author = 'Владелец') => {
      const current = loadInvestmentLedgerState();
      const cleanId = id.replace(/^custom-op::/, '').replace(/^custom-op-/, '');
      const nextCommitted = current.sharedCommitted.committedOtherOperations.filter(
        (x) => x.id !== cleanId
      );
      const nextPlans = { ...current.scenarioPlans };
      for (const sk of Object.keys(nextPlans)) {
        const sl = ensureScenarioPlanSlot(current, sk);
        sl.plannedOtherOperations = sl.plannedOtherOperations.filter(
          (x) => x.id !== cleanId
        );
        nextPlans[sk] = sl;
      }
      commitNextLedger({
        ...current,
        sharedCommitted: {
          ...current.sharedCommitted,
          committedOtherOperations: nextCommitted,
        },
        scenarioPlans: nextPlans,
        auditHistory: appendLedgerAudit(current, {
          author,
          scenarioScopeKey: schedule.activeScopeKey,
          operationTitle: title,
          actionType: 'delete_operation',
          beforeValue: title,
          afterValue: 'Удалено',
        }),
      });
    },
    [commitNextLedger, schedule.activeScopeKey]
  );

  const confirmResetToAutoPlan = useCallback(
    (author = 'Владелец') => {
      const current = loadInvestmentLedgerState();
      const next = applyResetScenarioToAutoPlan(current, schedule, author);
      commitNextLedger(next);
    },
    [commitNextLedger, schedule]
  );

  const setSelectedYear = useCallback(
    (nextYear: 2027 | 2028, author = 'Владелец') => {
      updateGlobalSettings({ selectedFinanceYear: nextYear }, author);
    },
    [updateGlobalSettings]
  );

  const setGroupCapitalMode = useCallback(
    (mode: GroupCapitalMode, author = 'Владелец') => {
      updateGlobalSettings({ groupCapitalMode: mode }, author);
    },
    [updateGlobalSettings]
  );

  return {
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
    lastSavedAtIso,
    updateGlobalSettings,
    updatePaymentOperation,
    updateBatchTerms,
    undoOperationOverride,
    saveCapitalInjection,
    removeCapitalInjection,
    saveCustomCashOperation,
    removeCustomCashOperation,
    confirmResetToAutoPlan,
  };
}
