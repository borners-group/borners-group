'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GrowthScenarioDef, ScenarioModelSpec } from '@/lib/scenarioData';
import type { CanonicalBrandCode } from '@/lib/unifiedBusinessEngine';
import {
  type BatchTermsManualOverride,
  type CapitalInjectionRecord,
  type ComputedInvestmentScheduleResult,
  type CustomCashOperationRecord,
  type InvestmentLedgerGlobalSettings,
  type InvestmentLedgerState,
  type ManualPaymentOverride,
  type ResetToAutoPlanPreview,
  appendLedgerAudit,
  applyResetScenarioToAutoPlan,
  computeInvestmentSchedule,
  computeResetToAutoPlanPreview,
  createDefaultInvestmentLedgerState,
  ensureScenarioPlanSlot,
  formatIsoDateHumanRu,
  loadInvestmentLedgerState,
  saveInvestmentLedgerState,
} from '@/lib/investmentScheduleEngine';

export interface UseInvestmentScheduleParams {
  models: ScenarioModelSpec[];
  scenarios: GrowthScenarioDef[];
  activeScenario: GrowthScenarioDef;
  brandFilter?: string;
  selectedScenarioByBrand?: Partial<Record<CanonicalBrandCode | 'LISCANI', number | null>>;
  includeGroupPortfolioInS1?: boolean;
  explicitInitialCashRub?: number;
  explicitWbLagMonths?: number | null;
  explicitWbScheduleSpecified?: boolean;
}

export function useInvestmentSchedule(params: UseInvestmentScheduleParams) {
  const [ledgerState, setLedgerState] = useState<InvestmentLedgerState>(() =>
    createDefaultInvestmentLedgerState()
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncLedger = () => {
      setLedgerState(loadInvestmentLedgerState());
    };
    syncLedger();
    window.addEventListener('borners-investment-ledger-changed', syncLedger);
    window.addEventListener('borners-finance-params-changed', syncLedger);
    window.addEventListener('storage', syncLedger);
    return () => {
      window.removeEventListener('borners-investment-ledger-changed', syncLedger);
      window.removeEventListener('borners-finance-params-changed', syncLedger);
      window.removeEventListener('storage', syncLedger);
    };
  }, []);

  const schedule: ComputedInvestmentScheduleResult = useMemo(
    () =>
      computeInvestmentSchedule({
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
      ledgerState,
    ]
  );

  const resetPreview: ResetToAutoPlanPreview = useMemo(
    () => computeResetToAutoPlanPreview(schedule, ledgerState),
    [schedule, ledgerState]
  );

  const commitNextLedger = useCallback((next: InvestmentLedgerState) => {
    const saved = saveInvestmentLedgerState(next, { syncFinanceParams: true });
    setLedgerState(saved);
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
      const targetScope =
        input.scenarioScopeKey && input.scenarioScopeKey !== 'SHARED'
          ? input.scenarioScopeKey
          : schedule.activeScopeKey;

      const existingCommitted = current.sharedCommitted.committedPaymentOverrides[input.opKey];
      const existingScen = current.scenarioPlans[targetScope]?.paymentOverrides?.[input.opKey];
      const baseOvr = existingCommitted || existingScen;

      const mergedOvr: ManualPaymentOverride = {
        opKey: input.opKey,
        batchKey: input.batchKey,
        customDateIso:
          input.patch.customDateIso !== undefined
            ? input.patch.customDateIso
            : baseOvr?.customDateIso,
        customAmountRub:
          input.patch.customAmountRub !== undefined
            ? input.patch.customAmountRub
            : baseOvr?.customAmountRub,
        customFactoryName:
          input.patch.customFactoryName !== undefined
            ? input.patch.customFactoryName
            : baseOvr?.customFactoryName,
        status: input.patch.status !== undefined ? input.patch.status : baseOvr?.status,
        splitTranches:
          input.patch.splitTranches !== undefined
            ? input.patch.splitTranches
            : baseOvr?.splitTranches,
        note: input.patch.note !== undefined ? input.patch.note : baseOvr?.note,
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
      const nextScenarioPlans = { ...current.scenarioPlans };
      const slot = ensureScenarioPlanSlot(current, targetScope);

      if (shouldStoreShared) {
        nextCommittedMap[input.opKey] = mergedOvr;
        delete slot.paymentOverrides[input.opKey];
      } else {
        delete nextCommittedMap[input.opKey];
        slot.paymentOverrides[input.opKey] = mergedOvr;
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
        if (mergedOvr.customAmountRub !== undefined) {
          afterParts.push(`Сумма: ${mergedOvr.customAmountRub.toLocaleString('ru-RU')} ₽`);
        }
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
      const targetScope =
        input.scenarioScopeKey && input.scenarioScopeKey !== 'SHARED'
          ? input.scenarioScopeKey
          : schedule.activeScopeKey;

      const existingCommitted = current.sharedCommitted.committedBatchOverrides[input.batchKey];
      const existingScen = current.scenarioPlans[targetScope]?.batchOverrides?.[input.batchKey];
      const baseB = existingCommitted || existingScen;

      const merged: BatchTermsManualOverride = {
        batchKey: input.batchKey,
        customPrepaymentPct:
          input.patch.customPrepaymentPct !== undefined
            ? input.patch.customPrepaymentPct
            : baseB?.customPrepaymentPct,
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
        updatedAtIso: new Date().toISOString(),
        updatedBy: author,
      };

      const nextCommittedBatch = { ...current.sharedCommitted.committedBatchOverrides };
      const nextScenarioPlans = { ...current.scenarioPlans };
      const slot = ensureScenarioPlanSlot(current, targetScope);

      if (input.isApprovedPo || Boolean(existingCommitted)) {
        nextCommittedBatch[input.batchKey] = merged;
      } else {
        slot.batchOverrides[input.batchKey] = merged;
      }
      nextScenarioPlans[targetScope] = slot;

      const afterParts: string[] = [];
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
      const targetScope = scopeKey || schedule.activeScopeKey;
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
      const targetScope = scopeKey || schedule.activeScopeKey;
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

  return {
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
  };
}
