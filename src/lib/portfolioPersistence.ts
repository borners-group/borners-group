import {
  INITIAL_SCENARIOS,
  type GrowthScenarioDef,
  type ModelPriorityLevel,
  type ScenarioModelSpec,
} from './scenarioData.ts';
import {
  ACTING_2027_SCENARIO_DEF,
  ACTING_2027_SCENARIO_ID,
  ACTING_2027_SCENARIO_MODELS,
  getActingSkuByWbOrVendor,
} from './actingAssortment2027.ts';
import {
  AKUSHA_2027_MODELS,
  AKUSHA_2027_SCENARIO_DEF,
  AKUSHA_2027_SCENARIO_ID,
} from './akushaAssortment2027.ts';
import {
  LISKANI_2027_MODELS,
  LISKANI_2027_SCENARIO_DEF,
  LISKANI_2027_SCENARIO_ID,
} from './liskaniAssortment2027.ts';
import {
  S1_100M_SCENARIO_MODELS,
  applyClientSavedS1SalesPlan,
  isUnverifiedActingSku,
} from './scenarioS1_100M.ts';
import {
  type CanonicalBrandCode,
  applyCategoryWbUnitEconomics,
  applyCategoryWbUnitEconomicsToPortfolio,
  detectModelBrandPortfolioLabel,
  ensureModelUnifiedV11,
  isScenarioCompatibleWithBrand,
  matchesBrandFilter,
  normalizePortfolioBrandCode,
} from './unifiedBusinessEngine.ts';
import {
  deleteModelGalleryFromIdb,
  safeGetStorageJson,
  safeSetStorageJson,
  savePortfolioSnapshotToIdb,
} from './safeStorage.ts';

const CLIENT_SAVED_S1_MODELS = applyClientSavedS1SalesPlan(S1_100M_SCENARIO_MODELS);
const RAW_BRN_001_SC_PACKS =
  S1_100M_SCENARIO_MODELS.find((m) => m.code === 'BRN-001-SC')?.plansByScenario[1]
    ?.monthlyPacks || [];
const CLIENT_BRN_001_SC_PACKS =
  CLIENT_SAVED_S1_MODELS.find((m) => m.code === 'BRN-001-SC')?.plansByScenario[1]
    ?.monthlyPacks || [];
const RAW_BRN_003_PACKS =
  S1_100M_SCENARIO_MODELS.find((m) => m.code === 'BRN-003')?.plansByScenario[1]
    ?.monthlyPacks || [];
const CLIENT_BRN_003_PACKS =
  CLIENT_SAVED_S1_MODELS.find((m) => m.code === 'BRN-003')?.plansByScenario[1]
    ?.monthlyPacks || [];

export const STORAGE_KEY_SCENARIOS = 'borners_tz_scenarios_v1';
export const STORAGE_KEY_MODELS = 'borners_tz_models_v1';
export const STORAGE_KEY_USER_PLANS_BACKUP = 'borners_user_saved_plans_v1';
export const STORAGE_KEY_ACTIVE_SCENARIO_ID = 'borners_active_scenario_id_v1';
export const STORAGE_KEY_S1_GROUP_PORTFOLIO = 'borners_s1_include_fukai_v1';
export const STORAGE_KEY_SCENARIO_BY_BRAND = 'borners_selected_scenario_by_brand_v1';
export const STORAGE_KEY_DELETED_MODELS = 'borners_deleted_model_ids_v1';
export const STORAGE_KEY_DELETED_SCENARIOS = 'borners_deleted_scenario_ids_v1';
export const STORAGE_KEY_DELETED_MODEL_SNAPSHOTS = 'borners_deleted_models_snapshots_v1';
export const STORAGE_KEY_PORTFOLIO_UPDATED_AT = 'borners_portfolio_updated_at_v1';
export const STORAGE_KEY_BACKUP_UPDATED_AT = 'borners_backup_updated_at_v1';
export const MIGRATION_KEY_LISKANI_269_V3 = 'borners_liskani_269_official_migrated_v3';
export const MIGRATION_KEY_AKUSHA_2027_V1 = 'borners_akusha_2027_official_migrated_v1';
export const MIGRATION_KEY_BORNERS_SCENARIO_REPAIR_V1 = 'borners_sales_scenario_repair_v1';

export function touchPortfolioUpdatedAt(explicitIso?: string): string {
  const iso = explicitIso || new Date().toISOString();
  safeSetStorageJson(STORAGE_KEY_PORTFOLIO_UPDATED_AT, iso);
  return iso;
}

export function getPortfolioUpdatedAt(): string | null {
  const val = safeGetStorageJson<string>(STORAGE_KEY_PORTFOLIO_UPDATED_AT);
  return typeof val === 'string' && val.trim().length > 0 ? val : null;
}

function isExactSamePacksArray(a: number[] | undefined, b: number[]): boolean {
  return (
    Array.isArray(a) &&
    a.length === 12 &&
    b.length === 12 &&
    a.every((v, idx) => v === b[idx])
  );
}

function upgradeUnadjustedRawS1SalesPlan<
  T extends {
    id?: string;
    code?: string;
    plansByScenario?: ScenarioModelSpec['plansByScenario'];
  },
>(entry: T): { updated: T; changed: boolean } {
  const idLower = (entry.id || '').trim().toLowerCase();
  const codeUpper = (entry.code || '').trim().toUpperCase();
  const p1 = entry.plansByScenario?.[1];
  if (!p1) return { updated: entry, changed: false };

  if (
    (idLower === 'scen-brn-001-sc' || codeUpper === 'BRN-001-SC') &&
    isExactSamePacksArray(p1.monthlyPacks, RAW_BRN_001_SC_PACKS)
  ) {
    return {
      changed: true,
      updated: {
        ...entry,
        plansByScenario: {
          ...entry.plansByScenario,
          1: {
            ...p1,
            monthlyPacks: [...CLIENT_BRN_001_SC_PACKS],
            monthlyPricesRub: Array(12).fill(2490),
          },
        },
      },
    };
  }

  if (
    (idLower === 'scen-brn-003' || codeUpper === 'BRN-003') &&
    isExactSamePacksArray(p1.monthlyPacks, RAW_BRN_003_PACKS)
  ) {
    return {
      changed: true,
      updated: {
        ...entry,
        plansByScenario: {
          ...entry.plansByScenario,
          1: {
            ...p1,
            monthlyPacks: [...CLIENT_BRN_003_PACKS],
            monthlyPricesRub: Array(12).fill(1990),
          },
        },
      },
    };
  }

  return { updated: entry, changed: false };
}

export function sanitizeSelectedScenarioByBrand(
  savedByBrand: Partial<Record<string, number | null>> | null | undefined,
  scenarios?: GrowthScenarioDef[]
): Partial<Record<CanonicalBrandCode, number | null>> {
  const next: Partial<Record<CanonicalBrandCode, number | null>> = {
    ...(savedByBrand as Partial<Record<CanonicalBrandCode, number | null>>),
  };

  if (
    next.FUKAI === undefined ||
    next.FUKAI === 1 ||
    next.FUKAI === AKUSHA_2027_SCENARIO_ID ||
    next.FUKAI === LISKANI_2027_SCENARIO_ID
  ) {
    next.FUKAI = ACTING_2027_SCENARIO_ID;
  }
  if (!next.LISKANI) {
    next.LISKANI = LISKANI_2027_SCENARIO_ID;
  }
  if (!next.AKUSHA) {
    next.AKUSHA = AKUSHA_2027_SCENARIO_ID;
  }

  // НА ТЕЛЕ: сохраняем явный null («Нет сценария»), но чиним undefined или несовместимые сценарии (1, 100, 202705, 202706)
  const ownedNaTeleScenario = Array.isArray(scenarios)
    ? scenarios.find(
        (s) =>
          !s.isArchived &&
          s.ownerBrandCode &&
          s.ownerBrandCode.trim().toUpperCase() === 'NA_TELE'
      )
    : undefined;
  const fallbackNaTeleScenarioId = ownedNaTeleScenario?.id ?? 2;

  if (next.NA_TELE === undefined) {
    next.NA_TELE = fallbackNaTeleScenarioId;
  } else if (typeof next.NA_TELE === 'number') {
    if (
      next.NA_TELE === 1 ||
      next.NA_TELE === ACTING_2027_SCENARIO_ID ||
      next.NA_TELE === AKUSHA_2027_SCENARIO_ID ||
      next.NA_TELE === LISKANI_2027_SCENARIO_ID
    ) {
      next.NA_TELE = fallbackNaTeleScenarioId;
    } else if (Array.isArray(scenarios) && scenarios.length > 0) {
      const foundNaTele = scenarios.find((s) => s.id === next.NA_TELE && !s.isArchived);
      if (!foundNaTele || !isScenarioCompatibleWithBrand(foundNaTele, 'NA_TELE')) {
        next.NA_TELE = fallbackNaTeleScenarioId;
      }
    }
  }

  // BORNERS никогда не может ссылаться на сценарий чужого бренда (AKUSHA 202706, LISKANI 202705 и т.д.)
  if (
    next.BORNERS === undefined ||
    next.BORNERS === null ||
    next.BORNERS === AKUSHA_2027_SCENARIO_ID ||
    next.BORNERS === LISKANI_2027_SCENARIO_ID
  ) {
    next.BORNERS = 1;
  } else if (Array.isArray(scenarios) && scenarios.length > 0 && typeof next.BORNERS === 'number') {
    const found = scenarios.find((s) => s.id === next.BORNERS && !s.isArchived);
    if (!found || !isScenarioCompatibleWithBrand(found, 'BORNERS')) {
      next.BORNERS = 1;
    }
  }

  return next;
}

export function runBornersSalesScenarioRepairMigrationV1(): void {
  const alreadyMigrated = safeGetStorageJson<string>(MIGRATION_KEY_BORNERS_SCENARIO_REPAIR_V1);
  const savedScenarios = safeGetStorageJson<GrowthScenarioDef[]>(STORAGE_KEY_SCENARIOS);

  // Постоянная защита от записи чужого сценария (202706 / 202705 / NA_TELE) в BORNERS
  const savedByBrand = safeGetStorageJson<Record<string, number | null>>(
    STORAGE_KEY_SCENARIO_BY_BRAND
  );
  if (savedByBrand && typeof savedByBrand === 'object') {
    const sanitized = sanitizeSelectedScenarioByBrand(
      savedByBrand,
      Array.isArray(savedScenarios) && savedScenarios.length > 0 ? savedScenarios : undefined
    );
    const shouldResetActingFromStaleBug =
      alreadyMigrated !== '1' && sanitized.BORNERS === ACTING_2027_SCENARIO_ID;
    const finalByBrand = shouldResetActingFromStaleBug
      ? { ...sanitized, BORNERS: 1 }
      : sanitized;
    if (
      finalByBrand.BORNERS !== savedByBrand.BORNERS ||
      finalByBrand.FUKAI !== savedByBrand.FUKAI ||
      finalByBrand.LISKANI !== savedByBrand.LISKANI ||
      finalByBrand.AKUSHA !== savedByBrand.AKUSHA ||
      finalByBrand.NA_TELE !== savedByBrand.NA_TELE
    ) {
      safeSetStorageJson(STORAGE_KEY_SCENARIO_BY_BRAND, finalByBrand);
    }
  }

  // Защита активного сценария по умолчанию: если в STORAGE_KEY_ACTIVE_SCENARIO_ID записан несовместимый с BORNERS/ALL сценарий (AKUSHA / LISKANI / NA_TELE) при сброшенном фильтре бренда — чиним
  const savedActiveId = safeGetStorageJson<number>(STORAGE_KEY_ACTIVE_SCENARIO_ID);
  if (typeof savedActiveId === 'number' && Array.isArray(savedScenarios) && savedScenarios.length > 0) {
    const foundActive = savedScenarios.find((s) => s.id === savedActiveId && !s.isArchived);
    if (!foundActive) {
      safeSetStorageJson(STORAGE_KEY_ACTIVE_SCENARIO_ID, 1);
    } else if (alreadyMigrated !== '1' && !isScenarioCompatibleWithBrand(foundActive, 'BORNERS')) {
      safeSetStorageJson(STORAGE_KEY_ACTIVE_SCENARIO_ID, 1);
    }
  }

  if (alreadyMigrated === '1') return;

  // Сбрасываем залипший чужой или исходный сценарий в активном ключе на эталонный Сценарий №1 (686,28 млн ₽)
  if (
    savedActiveId === AKUSHA_2027_SCENARIO_ID ||
    savedActiveId === LISKANI_2027_SCENARIO_ID ||
    savedActiveId === ACTING_2027_SCENARIO_ID
  ) {
    safeSetStorageJson(STORAGE_KEY_ACTIVE_SCENARIO_ID, 1);
  }

  // Если при прошлой догрузке S1_100M_SCENARIO_MODELS в кэш попали сырые неадаптированные числа BRN-001-SC / BRN-003 (606,37 млн ₽ вместо 686,28 млн ₽), обновляем их без потери ручных правок
  const backup = safeGetStorageJson<Record<string, UserSavedModelPlanBackup>>(
    STORAGE_KEY_USER_PLANS_BACKUP
  );
  if (backup && typeof backup === 'object') {
    let backupChanged = false;
    const nextBackup: Record<string, UserSavedModelPlanBackup> = {};
    for (const [k, entry] of Object.entries(backup)) {
      if (!entry) continue;
      const res = upgradeUnadjustedRawS1SalesPlan(entry);
      if (res.changed) backupChanged = true;
      nextBackup[k] = res.updated;
    }
    if (backupChanged) {
      safeSetStorageJson(STORAGE_KEY_USER_PLANS_BACKUP, nextBackup);
    }
  }

  const savedModels = safeGetStorageJson<ScenarioModelSpec[]>(STORAGE_KEY_MODELS);
  if (Array.isArray(savedModels) && savedModels.length > 0) {
    let modelsChanged = false;
    const nextModels = savedModels.map((m) => {
      const res = upgradeUnadjustedRawS1SalesPlan(m);
      if (res.changed) modelsChanged = true;
      return res.updated;
    });
    if (modelsChanged) {
      safeSetStorageJson(STORAGE_KEY_MODELS, nextModels);
    }
  }

  safeSetStorageJson(MIGRATION_KEY_BORNERS_SCENARIO_REPAIR_V1, '1');
}

export function isLegacyPlaceholderAkusha(
  m: Partial<ScenarioModelSpec> | Partial<UserSavedModelPlanBackup>
): boolean {
  const titleU = (m.title || '').toUpperCase();
  if (
    titleU.includes('CLOUD WALK') ||
    titleU.includes('SOFT SUEDE') ||
    titleU.includes('AKUSHA EVERYDAY')
  ) {
    return true;
  }
  return false;
}

export function runAkusha2027OfficialMigrationV1(): void {
  const alreadyMigrated = safeGetStorageJson<string>(MIGRATION_KEY_AKUSHA_2027_V1);
  if (alreadyMigrated === '1') return;

  const officialIdsAndCodes = new Set<string>();
  for (const m of AKUSHA_2027_MODELS) {
    officialIdsAndCodes.add(m.id.toUpperCase());
    officialIdsAndCodes.add(m.code.toUpperCase());
  }

  // 1. Очищаем реестр удалённых карточек от официальных AKU-001..AKU-031
  const prevDeleted = getDeletedModelsRegistry();
  if (prevDeleted.length > 0) {
    const cleanedDeleted = prevDeleted.filter(
      (item) => !officialIdsAndCodes.has(item.toUpperCase())
    );
    if (cleanedDeleted.length !== prevDeleted.length) {
      safeSetStorageJson(STORAGE_KEY_DELETED_MODELS, cleanedDeleted);
    }
  }

  const isOldDraftAkushaEntry = (
    entry: Partial<ScenarioModelSpec> | Partial<UserSavedModelPlanBackup>
  ): boolean => {
    if (isLegacyPlaceholderAkusha(entry)) return true;
    const brandU = (entry.customBrandLabel || '').toUpperCase();
    const codeU = (entry.code || '').trim().toUpperCase();
    const idU = (entry.id || '').trim().toUpperCase();
    const isAkusha =
      brandU === 'AKUSHA' ||
      codeU.startsWith('AKU-') ||
      idU.startsWith('SCEN-AKUSHA-') ||
      officialIdsAndCodes.has(codeU) ||
      officialIdsAndCodes.has(idU);
    if (!isAkusha) return false;
    return !entry.plansByScenario?.[AKUSHA_2027_SCENARIO_ID];
  };

  // 2. Очищаем backup пользовательских планов от старых черновых карточек AKUSHA, чтобы не было дублей
  const backup = safeGetStorageJson<Record<string, UserSavedModelPlanBackup>>(
    STORAGE_KEY_USER_PLANS_BACKUP
  );
  if (backup && typeof backup === 'object') {
    let backupChanged = false;
    const nextBackup: Record<string, UserSavedModelPlanBackup> = {};
    for (const [k, entry] of Object.entries(backup)) {
      if (entry && isOldDraftAkushaEntry(entry)) {
        backupChanged = true;
        continue;
      }
      nextBackup[k] = entry;
    }
    if (backupChanged) {
      safeSetStorageJson(STORAGE_KEY_USER_PLANS_BACKUP, nextBackup);
    }
  }

  // 3. Очищаем сохранённый список моделей от старых черновиков AKUSHA
  const savedModels = safeGetStorageJson<ScenarioModelSpec[]>(STORAGE_KEY_MODELS);
  if (Array.isArray(savedModels) && savedModels.length > 0) {
    const cleanedModels = savedModels.filter((m) => !isOldDraftAkushaEntry(m));
    if (cleanedModels.length !== savedModels.length) {
      safeSetStorageJson(STORAGE_KEY_MODELS, cleanedModels);
    }
  }

  // 4. Выбираем сценарий AKUSHA 2027 (202706 · 105,79 млн ₽ · 20 377 пар) для бренда AKUSHA
  const savedByBrand =
    safeGetStorageJson<Record<string, number | null>>(STORAGE_KEY_SCENARIO_BY_BRAND) || {};
  if (savedByBrand.AKUSHA !== AKUSHA_2027_SCENARIO_ID) {
    safeSetStorageJson(STORAGE_KEY_SCENARIO_BY_BRAND, {
      ...savedByBrand,
      AKUSHA: AKUSHA_2027_SCENARIO_ID,
    });
  }

  // 5. Добавляем сценарий AKUSHA 2027 в сохранённый список сценариев, если его там ещё нет
  const savedScenarios = safeGetStorageJson<Array<{ id: number }>>(STORAGE_KEY_SCENARIOS);
  if (
    Array.isArray(savedScenarios) &&
    savedScenarios.length > 0 &&
    !savedScenarios.some((s) => s.id === AKUSHA_2027_SCENARIO_ID)
  ) {
    safeSetStorageJson(STORAGE_KEY_SCENARIOS, [
      ...savedScenarios,
      AKUSHA_2027_SCENARIO_DEF,
    ]);
  }

  // 6. Обновляем кэш товарных групп для AKUSHA (9 официальных групп)
  const savedGroups = safeGetStorageJson<Array<{ id: string }>>('borners_product_groups_v1');
  if (
    Array.isArray(savedGroups) &&
    !savedGroups.some((g) => g.id === 'grp-akusha-winter-boots')
  ) {
    const filteredGroups = savedGroups.filter((g) => g.id !== 'grp-akusha-shoes');
    safeSetStorageJson('borners_product_groups_v1', filteredGroups);
  }

  safeSetStorageJson(MIGRATION_KEY_AKUSHA_2027_V1, '1');
}

export function isLegacyPlaceholderLiskani(
  m: Partial<ScenarioModelSpec> | Partial<UserSavedModelPlanBackup>
): boolean {
  const titleU = (m.title || '').toUpperCase();
  if (
    titleU.includes('ВЕНЕЦИЯ') ||
    titleU.includes('СКАНДИНАВИЯ') ||
    titleU.includes('ВОЗДУШНЫЙ ШЁЛК') ||
    titleU.includes('ВОЗДУШНЫЙ ШЕЛК')
  ) {
    return true;
  }
  const codeU = (m.code || '').trim().toUpperCase();
  if (/^(BRN-)?LSK-00[1-9]$/.test(codeU)) {
    return true;
  }
  if (
    /^LSC-0(0[1-9]|[12]\d|3[0-3])$/.test(codeU) &&
    (!m.liskaniSizeVariants || m.liskaniSizeVariants.length === 0)
  ) {
    return true;
  }
  return false;
}

export function runLiskani269OfficialMigrationV3(): void {
  const alreadyMigrated = safeGetStorageJson<string>(MIGRATION_KEY_LISKANI_269_V3);
  if (alreadyMigrated === '1') return;

  // 1. Очищаем реестр удалённых карточек от официальных LSC-001..LSC-033 и старых заглушек LSK-001..003
  const prevDeleted = getDeletedModelsRegistry();
  if (prevDeleted.length > 0) {
    const officialIdsAndCodes = new Set<string>();
    for (const m of LISKANI_2027_MODELS) {
      officialIdsAndCodes.add(m.id.toUpperCase());
      officialIdsAndCodes.add(m.code.toUpperCase());
    }
    const cleanedDeleted = prevDeleted.filter(
      (item) => !officialIdsAndCodes.has(item.toUpperCase())
    );
    if (cleanedDeleted.length !== prevDeleted.length) {
      safeSetStorageJson(STORAGE_KEY_DELETED_MODELS, cleanedDeleted);
    }
  }

  // 2. Очищаем backup пользовательских планов от старых заглушек Liskani без liskaniSizeVariants
  const backup = safeGetStorageJson<Record<string, UserSavedModelPlanBackup>>(
    STORAGE_KEY_USER_PLANS_BACKUP
  );
  if (backup && typeof backup === 'object') {
    let backupChanged = false;
    const nextBackup: Record<string, UserSavedModelPlanBackup> = {};
    for (const [k, entry] of Object.entries(backup)) {
      if (entry && isLegacyPlaceholderLiskani(entry)) {
        backupChanged = true;
        continue;
      }
      nextBackup[k] = entry;
    }
    if (backupChanged) {
      safeSetStorageJson(STORAGE_KEY_USER_PLANS_BACKUP, nextBackup);
    }
  }

  // 3. Гарантируем, что сценарий LISKANI 2027 (202705 · 500 млн ₽) выбран для бренда LISKANI
  const savedByBrand =
    safeGetStorageJson<Record<string, number | null>>(STORAGE_KEY_SCENARIO_BY_BRAND) || {};
  if (savedByBrand.LISKANI !== LISKANI_2027_SCENARIO_ID) {
    safeSetStorageJson(STORAGE_KEY_SCENARIO_BY_BRAND, {
      ...savedByBrand,
      LISKANI: LISKANI_2027_SCENARIO_ID,
    });
  }

  // 4. Добавляем сценарий LISKANI 2027 в сохранённый список сценариев, если его там ещё нет
  const savedScenarios = safeGetStorageJson<Array<{ id: number }>>(STORAGE_KEY_SCENARIOS);
  if (
    Array.isArray(savedScenarios) &&
    savedScenarios.length > 0 &&
    !savedScenarios.some((s) => s.id === LISKANI_2027_SCENARIO_ID)
  ) {
    safeSetStorageJson(STORAGE_KEY_SCENARIOS, [
      ...savedScenarios,
      LISKANI_2027_SCENARIO_DEF,
    ]);
  }

  // 5. Сбрасываем старый кэш групп товаров, если там пустая заглушка grp-liscani-curtains без 4 тканевых линеек
  const savedGroups = safeGetStorageJson<Array<{ id: string }>>('borners_product_groups_v1');
  if (
    Array.isArray(savedGroups) &&
    !savedGroups.some((g) => g.id === 'grp-liskani-blackout')
  ) {
    const filteredGroups = savedGroups.filter((g) => g.id !== 'grp-liscani-curtains');
    safeSetStorageJson('borners_product_groups_v1', filteredGroups);
  }

  safeSetStorageJson(MIGRATION_KEY_LISKANI_269_V3, '1');
}

export interface UserSavedModelPlanBackup {
  id: string;
  code: string;
  title?: string;
  subtitle?: string;
  brandId?: ScenarioModelSpec['brandId'];
  customBrandLabel?: string;
  categoryLabel?: string;
  primaryUnitLabel?: string;
  secondaryUnitLabel?: string;
  wbArticle?: string;
  modelStageStatus?: ScenarioModelSpec['modelStageStatus'];
  description?: string;
  unitsInPack?: number;
  retailPriceRub: number;
  unitCostRub: number;
  marketplaceFeePct?: number;
  logisticsRub?: number;
  adsPct?: number;
  buyoutRatePct?: number;
  procureByOrdersVolume?: boolean;
  responsiblePerson?: string;
  hasActualSalesOrPurchases?: boolean;
  priority?: ModelPriorityLevel;
  launchStatus: ScenarioModelSpec['launchStatus'];
  gallery?: ScenarioModelSpec['gallery'];
  palettes?: ScenarioModelSpec['palettes'];
  fabric?: ScenarioModelSpec['fabric'];
  construction?: ScenarioModelSpec['construction'];
  waistband?: ScenarioModelSpec['waistband'];
  productionSteps?: ScenarioModelSpec['productionSteps'];
  attachedPdfs?: ScenarioModelSpec['attachedPdfs'];
  liskaniSizeVariants?: ScenarioModelSpec['liskaniSizeVariants'];
  plansByScenario: ScenarioModelSpec['plansByScenario'];
  sharedSupplyAndFact?: ScenarioModelSpec['sharedSupplyAndFact'];
}

const LOCKED_SCENARIO_IDS_PERSISTENCE = new Set<number>([
  1,
  ACTING_2027_SCENARIO_ID,
  LISKANI_2027_SCENARIO_ID,
  AKUSHA_2027_SCENARIO_ID,
]);

export interface DeletedScenarioModelSnapshot {
  id: string;
  code: string;
  title: string;
  brandCode: string;
  imageUrl?: string;
  deletedAt: string;
  model: ScenarioModelSpec;
}

function safeDispatchWindowEvent(eventName: string): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new Event(eventName));
    } catch {
      // ignore in minimal test mocks
    }
  }
}

export function getDeletedModelSnapshots(): DeletedScenarioModelSnapshot[] {
  const list = safeGetStorageJson<DeletedScenarioModelSnapshot[]>(
    STORAGE_KEY_DELETED_MODEL_SNAPSHOTS
  );
  if (!Array.isArray(list)) return [];
  return list.filter((item) => Boolean(item && item.id && item.code && item.model));
}

export function saveDeletedModelSnapshot(model: ScenarioModelSpec): void {
  if (!model || !model.id || !model.code) return;
  const rawBrand = normalizePortfolioBrandCode(model.customBrandLabel || model.brandId);
  const brandCode = rawBrand === 'ALL' ? 'BORNERS' : rawBrand;
  const imageUrl = model.gallery?.[0]?.url || undefined;
  const idUpper = model.id.trim().toUpperCase();
  const codeUpper = model.code.trim().toUpperCase();

  const prev = getDeletedModelSnapshots();
  const deduped = prev.filter(
    (s) =>
      s.id.trim().toUpperCase() !== idUpper &&
      s.code.trim().toUpperCase() !== codeUpper
  );
  const snapshot: DeletedScenarioModelSnapshot = {
    id: model.id,
    code: model.code,
    title: model.title,
    brandCode,
    imageUrl,
    deletedAt: new Date().toISOString(),
    model,
  };
  const next = [snapshot, ...deduped].slice(0, 100);
  safeSetStorageJson(STORAGE_KEY_DELETED_MODEL_SNAPSHOTS, next);
  safeDispatchWindowEvent('borners-trash-models-changed');
}

export function removeDeletedModelSnapshot(
  idOrCode: string
): DeletedScenarioModelSnapshot | null {
  const target = (idOrCode || '').trim().toUpperCase();
  if (!target) return null;
  const prev = getDeletedModelSnapshots();
  if (prev.length === 0) return null;
  const found =
    prev.find(
      (s) =>
        s.id.trim().toUpperCase() === target ||
        s.code.trim().toUpperCase() === target
    ) || null;
  if (!found) return null;
  const foundIdUpper = found.id.trim().toUpperCase();
  const foundCodeUpper = found.code.trim().toUpperCase();
  const remaining = prev.filter(
    (s) =>
      s.id.trim().toUpperCase() !== target &&
      s.code.trim().toUpperCase() !== target &&
      s.id.trim().toUpperCase() !== foundIdUpper &&
      s.code.trim().toUpperCase() !== foundCodeUpper
  );
  safeSetStorageJson(STORAGE_KEY_DELETED_MODEL_SNAPSHOTS, remaining);
  safeDispatchWindowEvent('borners-trash-models-changed');
  return found;
}

export function clearAllDeletedModelSnapshots(): DeletedScenarioModelSnapshot[] {
  const prev = getDeletedModelSnapshots();
  safeSetStorageJson(STORAGE_KEY_DELETED_MODEL_SNAPSHOTS, []);
  safeDispatchWindowEvent('borners-trash-models-changed');
  return prev;
}

export function getDeletedScenariosRegistry(): number[] {
  const list = safeGetStorageJson<number[]>(STORAGE_KEY_DELETED_SCENARIOS);
  if (!Array.isArray(list)) return [];
  return Array.from(
    new Set(
      list
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && !LOCKED_SCENARIO_IDS_PERSISTENCE.has(n))
    )
  );
}

export function markScenarioAsDeletedInStorage(scenarioId: number): void {
  const cleanId = Number(scenarioId);
  if (!Number.isFinite(cleanId) || LOCKED_SCENARIO_IDS_PERSISTENCE.has(cleanId)) return;
  const prev = getDeletedScenariosRegistry();
  if (!prev.includes(cleanId)) {
    safeSetStorageJson(STORAGE_KEY_DELETED_SCENARIOS, [...prev, cleanId]);
  }
}

export function unmarkScenarioAsDeletedInStorage(scenarioId: number): void {
  const cleanId = Number(scenarioId);
  if (!Number.isFinite(cleanId)) return;
  const prev = getDeletedScenariosRegistry();
  if (prev.length === 0) return;
  const filtered = prev.filter((id) => id !== cleanId);
  if (filtered.length !== prev.length) {
    safeSetStorageJson(STORAGE_KEY_DELETED_SCENARIOS, filtered);
  }
}

export function getDeletedModelsRegistry(): string[] {
  const list = safeGetStorageJson<string[]>(STORAGE_KEY_DELETED_MODELS);
  return Array.isArray(list) ? list : [];
}

export function isModelMarkedDeleted(
  model: Pick<ScenarioModelSpec, 'id' | 'code'>,
  deletedRegistry?: string[]
): boolean {
  const reg = deletedRegistry ?? getDeletedModelsRegistry();
  if (reg.length === 0) return false;
  const set = new Set(reg.map((x) => x.toUpperCase()));
  return (
    set.has((model.id || '').toUpperCase()) ||
    set.has((model.code || '').trim().toUpperCase())
  );
}

export function markModelAsDeletedInStorage(
  model: Pick<ScenarioModelSpec, 'id' | 'code'> & Partial<ScenarioModelSpec>
): void {
  if (typeof model.title === 'string' && model.plansByScenario) {
    saveDeletedModelSnapshot(model as ScenarioModelSpec);
  }
  const prev = getDeletedModelsRegistry();
  const next = new Set(prev.map((x) => x.toUpperCase()));
  if (model.id) next.add(model.id.toUpperCase());
  if (model.code) next.add(model.code.trim().toUpperCase());
  safeSetStorageJson(STORAGE_KEY_DELETED_MODELS, Array.from(next));
}

export function unmarkModelAsDeletedInStorage(
  model: Pick<ScenarioModelSpec, 'id' | 'code'>
): void {
  if (model.id) removeDeletedModelSnapshot(model.id);
  if (model.code) removeDeletedModelSnapshot(model.code);
  const prev = getDeletedModelsRegistry();
  if (prev.length === 0) return;
  const idUpper = (model.id || '').toUpperCase();
  const codeUpper = (model.code || '').trim().toUpperCase();
  const filtered = prev.filter((item) => {
    const u = item.toUpperCase();
    return u !== idUpper && u !== codeUpper;
  });
  if (filtered.length !== prev.length) {
    safeSetStorageJson(STORAGE_KEY_DELETED_MODELS, filtered);
  }
}

export function clearDeletedModelsRegistry(): void {
  safeSetStorageJson(STORAGE_KEY_DELETED_MODELS, []);
}

export function syncUserPlansBackup(
  modelsList: ScenarioModelSpec[],
  options?: { replaceExact?: boolean }
): void {
  const deletedReg = getDeletedModelsRegistry();
  const prevBackup =
    safeGetStorageJson<Record<string, UserSavedModelPlanBackup>>(
      STORAGE_KEY_USER_PLANS_BACKUP
    ) || {};

  const backup: Record<string, UserSavedModelPlanBackup> = {};
  // Сохраняем все ранее созданные пользователем модели из prevBackup, если они не помечены удалёнными (если не запрошена точная перезапись)
  if (!options?.replaceExact) {
    for (const [k, entry] of Object.entries(prevBackup)) {
      if (
        entry &&
        entry.id &&
        entry.code &&
        !isLegacyPlaceholderLiskani(entry) &&
        !isLegacyPlaceholderAkusha(entry) &&
        !isModelMarkedDeleted(entry, deletedReg)
      ) {
        backup[k] = entry;
      }
    }
  }

  for (const raw of modelsList) {
    if (isModelMarkedDeleted(raw, deletedReg)) continue;
    const m = ensureModelUnifiedV11(raw);
    const rawGal = Array.isArray(raw.gallery) ? raw.gallery : m.gallery;
    const isExplicitEmptyGal = Array.isArray(raw.gallery) && raw.gallery.length === 0;
    const hasBase64InGal =
      Array.isArray(rawGal) &&
      rawGal.some(
        (g) =>
          (typeof g?.url === 'string' && g.url.startsWith('data:image/')) ||
          (typeof g?.originalUrl === 'string' && g.originalUrl.startsWith('data:image/'))
      );
    // Никогда не дублируем base64-фото в резервном ключе borners_user_saved_plans_v1,
    // чтобы не удваивать расход квоты localStorage (5 МБ) и не затирать фото при stripOversizedDataUrls
    const backupGallery = isExplicitEmptyGal
      ? []
      : hasBase64InGal
      ? undefined
      : m.gallery;

    backup[m.id] = {
      id: m.id,
      code: m.code,
      title: m.title,
      subtitle: m.subtitle,
      brandId: m.brandId,
      customBrandLabel: m.customBrandLabel,
      categoryLabel: m.categoryLabel,
      primaryUnitLabel: m.primaryUnitLabel,
      secondaryUnitLabel: m.secondaryUnitLabel,
      wbArticle: m.wbArticle,
      modelStageStatus: m.modelStageStatus,
      description: m.description,
      unitsInPack: m.unitsInPack,
      retailPriceRub: m.retailPriceRub,
      unitCostRub: m.unitCostRub,
      marketplaceFeePct: m.marketplaceFeePct,
      logisticsRub: m.logisticsRub,
      adsPct: m.adsPct,
      buyoutRatePct: m.buyoutRatePct,
      procureByOrdersVolume: m.procureByOrdersVolume,
      responsiblePerson: m.responsiblePerson,
      hasActualSalesOrPurchases: m.hasActualSalesOrPurchases,
      priority: m.priority,
      launchStatus: m.launchStatus,
      gallery: backupGallery,
      palettes: Array.isArray(raw.palettes) && raw.palettes.length === 0 ? [] : m.palettes,
      fabric: m.fabric,
      construction: m.construction,
      waistband: m.waistband,
      productionSteps: m.productionSteps,
      attachedPdfs: m.attachedPdfs,
      liskaniSizeVariants: m.liskaniSizeVariants,
      plansByScenario: m.plansByScenario,
      sharedSupplyAndFact: m.sharedSupplyAndFact,
    };
  }
  if (safeSetStorageJson(STORAGE_KEY_USER_PLANS_BACKUP, backup)) {
    safeSetStorageJson(STORAGE_KEY_BACKUP_UPDATED_AT, new Date().toISOString());
  }
}

export function overlayBackupOntoModels(
  modelsList: ScenarioModelSpec[],
  options?: { fromExistingModelsStorage?: boolean }
): ScenarioModelSpec[] {
  const backup = safeGetStorageJson<Record<string, UserSavedModelPlanBackup>>(
    STORAGE_KEY_USER_PLANS_BACKUP
  );
  const deletedReg = getDeletedModelsRegistry();

  // Если основной ключ borners_tz_models_v1 присутствует и свежее резервного ключа
  // (например, резервный ключ не смог перезаписаться из-за квоты), не откатываем поля моделей назад
  const portfolioIso = getPortfolioUpdatedAt();
  const backupIso = safeGetStorageJson<string>(STORAGE_KEY_BACKUP_UPDATED_AT);
  const portfolioTs = portfolioIso ? Date.parse(portfolioIso) : NaN;
  const backupTs = backupIso ? Date.parse(backupIso) : NaN;
  const isBackupStaleVsPrimary =
    Boolean(options?.fromExistingModelsStorage) &&
    Number.isFinite(portfolioTs) &&
    Number.isFinite(backupTs) &&
    portfolioTs > backupTs + 1000;

  const overlaid = modelsList
    .filter((m) => !isModelMarkedDeleted(m, deletedReg))
    .map((rawM) => {
      const m = ensureModelUnifiedV11(applyCategoryWbUnitEconomics(rawM));
      if (!backup || typeof backup !== 'object' || isBackupStaleVsPrimary) return m;

      const saved =
        backup[m.id] ||
        Object.values(backup).find(
          (b) => b.code && b.code.toUpperCase() === m.code.toUpperCase()
        );
      if (!saved) return m;

      // Если это официальная карточка LISKANI 2027 (с матрицей размерных SKU),
      // игнорируем старый черновой бэкап от тестовых заглушек без liskaniSizeVariants
      if (
        m.liskaniSizeVariants &&
        m.liskaniSizeVariants.length > 0 &&
        (!saved.liskaniSizeVariants ||
          saved.liskaniSizeVariants.length === 0 ||
          !saved.plansByScenario?.[LISKANI_2027_SCENARIO_ID] ||
          (saved.title &&
            (saved.title.includes('Венеция') ||
              saved.title.includes('Скандинавия') ||
              saved.title.includes('Воздушный шёлк'))))
      ) {
        return m;
      }

      const explicitEmptyGallery =
        Array.isArray(saved.gallery) &&
        saved.gallery.length === 0 &&
        (!Array.isArray(rawM.gallery) || rawM.gallery.length === 0);
      const explicitEmptyPalettes =
        Array.isArray(saved.palettes) && saved.palettes.length === 0;

      const savedValidPhotos = Array.isArray(saved.gallery)
        ? saved.gallery.filter((g) => Boolean(g?.url && g.url.trim().length > 0))
        : null;
      const mValidPhotosCount = Array.isArray(m.gallery)
        ? m.gallery.filter((g) => Boolean(g?.url && g.url.trim().length > 0)).length
        : 0;
      const resolvedGallery = explicitEmptyGallery
        ? []
        : savedValidPhotos &&
          savedValidPhotos.length > 0 &&
          savedValidPhotos.length >= mValidPhotosCount
        ? savedValidPhotos
        : m.gallery;

      const mergedRaw: ScenarioModelSpec = {
        ...m,
        code: saved.code ?? m.code,
        title: saved.title ?? m.title,
        subtitle: saved.subtitle ?? m.subtitle,
        brandId: saved.brandId ?? m.brandId,
        customBrandLabel: saved.customBrandLabel ?? m.customBrandLabel,
        categoryLabel: saved.categoryLabel ?? m.categoryLabel,
        primaryUnitLabel: saved.primaryUnitLabel ?? m.primaryUnitLabel,
        secondaryUnitLabel: saved.secondaryUnitLabel ?? m.secondaryUnitLabel,
        wbArticle: saved.wbArticle ?? m.wbArticle,
        modelStageStatus: saved.modelStageStatus ?? m.modelStageStatus,
        description: saved.description ?? m.description,
        unitsInPack: saved.unitsInPack ?? m.unitsInPack,
        retailPriceRub: saved.retailPriceRub ?? m.retailPriceRub,
        unitCostRub: saved.unitCostRub ?? m.unitCostRub,
        marketplaceFeePct: saved.marketplaceFeePct ?? m.marketplaceFeePct,
        logisticsRub: saved.logisticsRub ?? m.logisticsRub,
        adsPct: saved.adsPct ?? m.adsPct,
        buyoutRatePct: saved.buyoutRatePct ?? m.buyoutRatePct,
        procureByOrdersVolume:
          saved.procureByOrdersVolume !== undefined
            ? saved.procureByOrdersVolume
            : m.procureByOrdersVolume,
        responsiblePerson: saved.responsiblePerson ?? m.responsiblePerson,
        hasActualSalesOrPurchases:
          saved.hasActualSalesOrPurchases !== undefined
            ? saved.hasActualSalesOrPurchases
            : m.hasActualSalesOrPurchases,
        priority: saved.priority ?? m.priority,
        launchStatus: saved.launchStatus ?? m.launchStatus,
        gallery: resolvedGallery,
        palettes: Array.isArray(saved.palettes) ? saved.palettes : m.palettes,
        fabric: saved.fabric || m.fabric,
        construction: saved.construction || m.construction,
        waistband: saved.waistband || m.waistband,
        productionSteps: saved.productionSteps || m.productionSteps,
        attachedPdfs:
          saved.attachedPdfs !== undefined ? saved.attachedPdfs : m.attachedPdfs,
        liskaniSizeVariants: saved.liskaniSizeVariants || m.liskaniSizeVariants,
        plansByScenario: saved.plansByScenario || m.plansByScenario,
        sharedSupplyAndFact: saved.sharedSupplyAndFact || m.sharedSupplyAndFact,
      };

      const normalized = ensureModelUnifiedV11(
        applyCategoryWbUnitEconomics(mergedRaw)
      );
      return {
        ...normalized,
        gallery: explicitEmptyGallery ? [] : normalized.gallery,
        palettes: explicitEmptyPalettes ? [] : normalized.palettes,
      };
    });

  // Авто-восстановление любых пользовательских моделей (AKUSHA и др.) из borners_user_saved_plans_v1,
  // если основной ключ borners_tz_models_v1 был потерян или сброшен при переполнении квоты
  if (backup && typeof backup === 'object') {
    for (const saved of Object.values(backup)) {
      if (!saved || !saved.id || !saved.code) continue;
      if (
        ['scen-model-001', 'scen-model-002', 'scen-model-003', 'scen-model-004'].includes(
          saved.id
        ) ||
        ['№001', '№002', '№003', '№004'].includes(saved.code)
      ) {
        continue;
      }
      if (isLegacyPlaceholderLiskani(saved) || isLegacyPlaceholderAkusha(saved)) continue;
      if (isModelMarkedDeleted(saved, deletedReg)) continue;

      const alreadyInList = overlaid.some(
        (m) =>
          m.id === saved.id ||
          m.code.trim().toUpperCase() === saved.code.trim().toUpperCase()
      );
      if (alreadyInList) continue;

      const explicitEmptyGallery =
        Array.isArray(saved.gallery) && saved.gallery.length === 0;
      const explicitEmptyPalettes =
        Array.isArray(saved.palettes) && saved.palettes.length === 0;

      const reconstructedRaw: ScenarioModelSpec = {
        id: saved.id,
        code: saved.code,
        title: saved.title || saved.code,
        subtitle: saved.subtitle || `${saved.categoryLabel || 'Модель'} · ${saved.unitsInPack || 1} ед.`,
        brandId: saved.brandId || 'BORNERS',
        customBrandLabel: saved.customBrandLabel,
        categoryLabel: saved.categoryLabel,
        primaryUnitLabel: saved.primaryUnitLabel,
        secondaryUnitLabel: saved.secondaryUnitLabel,
        wbArticle: saved.wbArticle || '',
        modelStageStatus: saved.modelStageStatus || 'Идея',
        description: saved.description || '',
        launchStatus: saved.launchStatus || 'В плане',
        unitsInPack: saved.unitsInPack || 1,
        retailPriceRub: saved.retailPriceRub ?? 1990,
        unitCostRub: saved.unitCostRub ?? 650,
        marketplaceFeePct: saved.marketplaceFeePct ?? 22,
        logisticsRub: saved.logisticsRub ?? 95,
        adsPct: saved.adsPct ?? 10,
        buyoutRatePct: saved.buyoutRatePct,
        procureByOrdersVolume: saved.procureByOrdersVolume,
        responsiblePerson: saved.responsiblePerson || 'Владелец бренда',
        priority: saved.priority || 'Высокий',
        hasActualSalesOrPurchases: saved.hasActualSalesOrPurchases ?? false,
        liskaniSizeVariants: saved.liskaniSizeVariants,
        palettes: Array.isArray(saved.palettes) ? saved.palettes : [],
        gallery: Array.isArray(saved.gallery) ? saved.gallery : [],
        attachedPdfs: Array.isArray(saved.attachedPdfs) ? saved.attachedPdfs : [],
        sharedSupplyAndFact: saved.sharedSupplyAndFact,
        construction: saved.construction || {
          type: 'Базовая конструкция',
          fit: 'Стандартная посадка',
          sideSeam: 'Стандартный шов',
          frontPanel: 'Базовая деталь',
          gusset: 'Стандарт',
          seams: 'Усиленные швы',
        },
        waistband: saved.waistband || {
          width: 'Стандарт',
          type: 'Фирменное исполнение',
          colorRule: 'В тон изделия',
          logoRepeat: 'Фирменная маркировка',
          elasticity: 'Стабильная фиксация',
          bandBgHex: '#1E293B',
          bandTextHex: '#F8FAFC',
        },
        fabric: saved.fabric || {
          composition: 'Премиальные материалы',
          density: 'Стандарт',
          knitType: 'Базовое исполнение',
          touchFeel: 'Комфортная фактура',
          swatchHex: '#1E293B',
        },
        productionSteps: Array.isArray(saved.productionSteps) ? saved.productionSteps : [],
        plansByScenario: saved.plansByScenario || {},
      };

      const normalized = ensureModelUnifiedV11(
        applyCategoryWbUnitEconomics(reconstructedRaw)
      );
      overlaid.push({
        ...normalized,
        gallery: explicitEmptyGallery ? [] : normalized.gallery,
        palettes: explicitEmptyPalettes ? [] : normalized.palettes,
      });
    }
  }

  return overlaid;
}

export function persistPortfolioModels(modelsList: ScenarioModelSpec[]): ScenarioModelSpec[] {
  const deletedReg = getDeletedModelsRegistry();
  const clean = modelsList.filter((m) => !isModelMarkedDeleted(m, deletedReg));
  touchPortfolioUpdatedAt();
  safeSetStorageJson(STORAGE_KEY_MODELS, clean);
  syncUserPlansBackup(clean);
  return clean;
}

export function deleteModelFromPortfolio(
  modelsList: ScenarioModelSpec[],
  modelToDelete: Pick<ScenarioModelSpec, 'id' | 'code'>
): ScenarioModelSpec[] {
  const fullMatch = modelsList.find(
    (m) =>
      m.id === modelToDelete.id ||
      m.code.trim().toUpperCase() === modelToDelete.code.trim().toUpperCase()
  );
  if (fullMatch) {
    saveDeletedModelSnapshot(fullMatch);
  }
  markModelAsDeletedInStorage(modelToDelete);
  const remaining = modelsList.filter(
    (m) =>
      m.id !== modelToDelete.id &&
      m.code.trim().toUpperCase() !== modelToDelete.code.trim().toUpperCase()
  );
  touchPortfolioUpdatedAt();
  safeSetStorageJson(STORAGE_KEY_MODELS, remaining);
  syncUserPlansBackup(remaining);
  return remaining;
}

export function restoreDeletedModelFromTrash(
  idOrCode: string
): ScenarioModelSpec | null {
  const target = (idOrCode || '').trim().toUpperCase();
  if (!target) return null;
  const snapshots = getDeletedModelSnapshots();
  const snap =
    snapshots.find(
      (s) =>
        s.id.trim().toUpperCase() === target ||
        s.code.trim().toUpperCase() === target
    ) || null;
  if (!snap) return null;

  unmarkModelAsDeletedInStorage(snap.model);
  removeDeletedModelSnapshot(idOrCode);

  const currentModels = hydratePortfolioModelsFromStorage();
  const restored = ensureModelUnifiedV11(snap.model);
  const existingIdx = currentModels.findIndex(
    (m) =>
      m.id === restored.id ||
      m.code.trim().toUpperCase() === restored.code.trim().toUpperCase()
  );
  const nextModels =
    existingIdx >= 0
      ? currentModels.map((m, i) => (i === existingIdx ? restored : m))
      : [restored, ...currentModels];

  const persisted = persistPortfolioModels(nextModels);
  void savePortfolioSnapshotToIdb(persisted, getPortfolioUpdatedAt() || undefined);
  safeDispatchWindowEvent('borners-scenario-models-changed');
  safeDispatchWindowEvent('borners-trash-models-changed');
  return restored;
}

export function permanentlyDeleteModelFromTrash(idOrCode: string): void {
  const removed = removeDeletedModelSnapshot(idOrCode);
  if (removed) {
    void deleteModelGalleryFromIdb(removed.id);
  }
  safeDispatchWindowEvent('borners-trash-models-changed');
}

export function applyPortfolioBackupSnapshotToStorage(
  models: ScenarioModelSpec[],
  scenarios?: GrowthScenarioDef[]
): void {
  const presentIds = new Set<string>();
  const presentCodes = new Set<string>();
  const presentTitles = new Set<string>();

  for (const m of models) {
    if (!m) continue;
    if (m.id) presentIds.add(m.id.trim().toUpperCase());
    if (m.code) presentCodes.add(m.code.trim().toUpperCase());
    if (m.title) presentTitles.add(m.title.trim().toUpperCase());
  }

  const nextDeleted = new Set(
    getDeletedModelsRegistry()
      .map((x) => x.toUpperCase())
      .filter((x) => !presentIds.has(x) && !presentCodes.has(x))
  );

  for (const seed of [
    ...ACTING_2027_SCENARIO_MODELS,
    ...S1_100M_SCENARIO_MODELS,
    ...LISKANI_2027_MODELS,
    ...AKUSHA_2027_MODELS,
  ]) {
    const idU = seed.id.trim().toUpperCase();
    const codeU = seed.code.trim().toUpperCase();
    const titleU = seed.title.trim().toUpperCase();
    if (!presentIds.has(idU) && !presentCodes.has(codeU) && !presentTitles.has(titleU)) {
      nextDeleted.add(idU);
      nextDeleted.add(codeU);
    }
  }

  safeSetStorageJson(STORAGE_KEY_DELETED_MODELS, Array.from(nextDeleted));
  touchPortfolioUpdatedAt();
  safeSetStorageJson(STORAGE_KEY_MODELS, models);
  syncUserPlansBackup(models, { replaceExact: true });
  void savePortfolioSnapshotToIdb(models, getPortfolioUpdatedAt() || undefined);

  if (Array.isArray(scenarios) && scenarios.length > 0) {
    for (const s of scenarios) {
      if (s && typeof s.id === 'number') {
        unmarkScenarioAsDeletedInStorage(s.id);
      }
    }
    safeSetStorageJson(STORAGE_KEY_SCENARIOS, scenarios);
  }

  safeSetStorageJson(STORAGE_KEY_DELETED_MODEL_SNAPSHOTS, []);
}

export async function resetPortfolioStorageToDemoDefaults(): Promise<void> {
  if (typeof window !== 'undefined' && window.localStorage) {
    const keysToClear = [
      STORAGE_KEY_MODELS,
      STORAGE_KEY_SCENARIOS,
      STORAGE_KEY_USER_PLANS_BACKUP,
      STORAGE_KEY_DELETED_MODELS,
      STORAGE_KEY_DELETED_SCENARIOS,
      STORAGE_KEY_DELETED_MODEL_SNAPSHOTS,
      STORAGE_KEY_SCENARIO_BY_BRAND,
      STORAGE_KEY_ACTIVE_SCENARIO_ID,
      STORAGE_KEY_S1_GROUP_PORTFOLIO,
    ];
    for (const k of keysToClear) {
      try {
        window.localStorage.removeItem(k);
      } catch {
        // ignore
      }
    }
  }

  const freshModels = hydratePortfolioModelsFromStorage();
  const updatedIso = touchPortfolioUpdatedAt();
  await savePortfolioSnapshotToIdb(freshModels, updatedIso);

  safeDispatchWindowEvent('borners-scenario-models-changed');
  safeDispatchWindowEvent('borners-scenarios-changed');
  safeDispatchWindowEvent('borners-active-scenario-changed');
  safeDispatchWindowEvent('borners-trash-models-changed');
}

export function hydratePortfolioModelsFromStorage(): ScenarioModelSpec[] {
  runLiskani269OfficialMigrationV3();
  runAkusha2027OfficialMigrationV1();
  runBornersSalesScenarioRepairMigrationV1();
  const deletedReg = getDeletedModelsRegistry();
  const parsedModels = safeGetStorageJson<ScenarioModelSpec[]>(STORAGE_KEY_MODELS);

  if (Array.isArray(parsedModels) && parsedModels.length > 0) {
    const filteredLegacy = parsedModels.filter(
      (m) =>
        !['scen-model-001', 'scen-model-002', 'scen-model-003', 'scen-model-004'].includes(
          m.id
        ) &&
        !['№001', '№002', '№003', '№004'].includes(m.code) &&
        !isLegacyPlaceholderLiskani(m) &&
        !isLegacyPlaceholderAkusha(m) &&
        !isModelMarkedDeleted(m, deletedReg)
    );

    const merged = [...filteredLegacy];
    for (const itemMod of [
      ...ACTING_2027_SCENARIO_MODELS,
      ...CLIENT_SAVED_S1_MODELS,
      ...LISKANI_2027_MODELS,
      ...AKUSHA_2027_MODELS,
    ]) {
      if (isModelMarkedDeleted(itemMod, deletedReg)) {
        continue;
      }
      const idx = merged.findIndex(
        (m) =>
          m.id === itemMod.id ||
          m.code.toUpperCase() === itemMod.code.toUpperCase() ||
          m.title.toUpperCase() === itemMod.title.toUpperCase()
      );
      if (idx >= 0) {
        if (
          merged[idx].attachedPdfs === undefined &&
          itemMod.attachedPdfs &&
          itemMod.attachedPdfs.length > 0
        ) {
          merged[idx] = {
            ...merged[idx],
            attachedPdfs: itemMod.attachedPdfs,
          };
        }
        if (
          (!merged[idx].liskaniSizeVariants ||
            merged[idx].liskaniSizeVariants!.length === 0) &&
          itemMod.liskaniSizeVariants &&
          itemMod.liskaniSizeVariants.length > 0
        ) {
          merged[idx] = {
            ...itemMod,
            ...merged[idx],
            gallery:
              itemMod.gallery && itemMod.gallery.length > 0
                ? itemMod.gallery
                : merged[idx].gallery,
            liskaniSizeVariants: itemMod.liskaniSizeVariants,
            plansByScenario: {
              ...itemMod.plansByScenario,
              ...merged[idx].plansByScenario,
              [LISKANI_2027_SCENARIO_ID]:
                itemMod.plansByScenario[LISKANI_2027_SCENARIO_ID],
            },
          };
        }
      } else {
        merged.push(itemMod);
      }
    }

    const hydrated = overlayBackupOntoModels(merged, { fromExistingModelsStorage: true });
    if (hydrated.length !== parsedModels.length) {
      safeSetStorageJson(STORAGE_KEY_MODELS, hydrated);
    }
    return hydrated;
  }

  const defaultList = applyCategoryWbUnitEconomicsToPortfolio(
    applyClientSavedS1SalesPlan([
      ...ACTING_2027_SCENARIO_MODELS,
      ...S1_100M_SCENARIO_MODELS,
      ...LISKANI_2027_MODELS,
      ...AKUSHA_2027_MODELS,
    ])
  ).filter((m) => !isModelMarkedDeleted(m, deletedReg));

  const recovered = overlayBackupOntoModels(defaultList);
  if (recovered.length > defaultList.length) {
    safeSetStorageJson(STORAGE_KEY_MODELS, recovered);
  }
  return recovered;
}

export interface FullPlatformBackupBundleV2 {
  exportedAt: string;
  platformVersion: string;
  scenarios: GrowthScenarioDef[];
  models: ScenarioModelSpec[];
  selectedScenarioByBrand: Partial<Record<CanonicalBrandCode, number | null>>;
  includeGroupPortfolioInS1?: boolean;
  productGroups?: unknown;
  platformState?: Record<string, unknown>;
}

export function buildFullPlatformBackupBundle(params: {
  scenarios: GrowthScenarioDef[];
  models: ScenarioModelSpec[];
  selectedScenarioByBrand: Partial<Record<string, number | null>>;
  includeGroupPortfolioInS1?: boolean;
  productGroups?: unknown;
  platformState?: Record<string, unknown> | null;
}): FullPlatformBackupBundleV2 {
  const cleanScenarios = Array.isArray(params.scenarios) ? params.scenarios : INITIAL_SCENARIOS;
  const cleanModels = Array.isArray(params.models)
    ? params.models.map((m) => ensureModelUnifiedV11(m))
    : [];
  return {
    exportedAt: new Date().toISOString(),
    platformVersion: 'BORNERS GROUP Strategy Platform 2027 · Full Backup v2',
    scenarios: cleanScenarios,
    models: cleanModels,
    selectedScenarioByBrand: sanitizeSelectedScenarioByBrand(
      params.selectedScenarioByBrand,
      cleanScenarios
    ),
    includeGroupPortfolioInS1: Boolean(params.includeGroupPortfolioInS1),
    productGroups: params.productGroups ?? undefined,
    platformState: params.platformState ?? undefined,
  };
}

export function parseFullPlatformBackupBundle(rawJson: string): {
  valid: boolean;
  error?: string;
  bundle?: FullPlatformBackupBundleV2;
} {
  try {
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: 'Файл резервной копии не является корректным JSON-объектом' };
    }
    const rawModels = Array.isArray(parsed.models) ? (parsed.models as ScenarioModelSpec[]) : null;
    const rawScenarios = Array.isArray(parsed.scenarios)
      ? (parsed.scenarios as GrowthScenarioDef[])
      : INITIAL_SCENARIOS;

    if (!rawModels || rawModels.length === 0) {
      return {
        valid: false,
        error: 'В файле резервной копии не найден массив карточек каталога (models)',
      };
    }

    const normalizedModels = applyCategoryWbUnitEconomicsToPortfolio(
      rawModels.map((m) => ensureModelUnifiedV11(m))
    );
    const normalizedScenarios = [
      ...rawScenarios,
      ...(rawScenarios.some((s) => s.id === ACTING_2027_SCENARIO_ID)
        ? []
        : [ACTING_2027_SCENARIO_DEF]),
      ...(rawScenarios.some((s) => s.id === LISKANI_2027_SCENARIO_ID)
        ? []
        : [LISKANI_2027_SCENARIO_DEF]),
      ...(rawScenarios.some((s) => s.id === AKUSHA_2027_SCENARIO_ID)
        ? []
        : [AKUSHA_2027_SCENARIO_DEF]),
    ];

    const sanitizedByBrand = sanitizeSelectedScenarioByBrand(
      (parsed.selectedScenarioByBrand as Partial<Record<string, number | null>>) || {},
      normalizedScenarios
    );

    return {
      valid: true,
      bundle: {
        exportedAt:
          typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
        platformVersion:
          typeof parsed.platformVersion === 'string'
            ? parsed.platformVersion
            : 'BORNERS GROUP Backup Restored',
        scenarios: normalizedScenarios,
        models: normalizedModels,
        selectedScenarioByBrand: sanitizedByBrand,
        includeGroupPortfolioInS1:
          typeof parsed.includeGroupPortfolioInS1 === 'boolean'
            ? parsed.includeGroupPortfolioInS1
            : false,
        productGroups: parsed.productGroups,
        platformState:
          parsed.platformState && typeof parsed.platformState === 'object'
            ? (parsed.platformState as Record<string, unknown>)
            : undefined,
      },
    };
  } catch (err) {
    return {
      valid: false,
      error:
        err instanceof Error
          ? `Ошибка чтения JSON: ${err.message}`
          : 'Не удалось прочитать JSON-файл резервной копии',
    };
  }
}

export function filterModelsForScenario(
  models: ScenarioModelSpec[],
  scenario: GrowthScenarioDef,
  includeGroupPortfolioInS1: boolean,
  brandFilter: string = 'ALL'
): ScenarioModelSpec[] {
  const isActing = scenario.id === ACTING_2027_SCENARIO_ID;
  const normFilter =
    brandFilter && brandFilter !== 'ALL'
      ? normalizePortfolioBrandCode(brandFilter)
      : 'ALL';
  const normOwner =
    scenario.ownerBrandCode && scenario.ownerBrandCode !== 'ALL'
      ? normalizePortfolioBrandCode(scenario.ownerBrandCode)
      : 'ALL';

  return models.filter((m) => {
    if (m.launchStatus === 'В архиве') return false;
    if (
      ['scen-model-001', 'scen-model-002', 'scen-model-003', 'scen-model-004'].includes(
        m.id
      ) ||
      ['№001', '№002', '№003', '№004'].includes(m.code)
    ) {
      return false;
    }

    if (normFilter !== 'ALL') {
      if (!matchesBrandFilter(m, normFilter)) {
        return false;
      }
      if (normFilter === 'AKUSHA' || normFilter === 'LISKANI') {
        return true;
      }
    }

    if (normOwner !== 'ALL' && normOwner !== 'BORNERS') {
      return matchesBrandFilter(m, normOwner);
    }

    const modelBrand = normalizePortfolioBrandCode(detectModelBrandPortfolioLabel(m));

    if (isActing) {
      if (modelBrand !== 'BORNERS' && modelBrand !== 'FUKAI') {
        return false;
      }
      const okActing =
        Boolean(getActingSkuByWbOrVendor(m.code, m.title)) ||
        Boolean(m.plansByScenario[ACTING_2027_SCENARIO_ID]);
      return okActing;
    }

    if (scenario.id === 1 || normOwner === 'BORNERS') {
      if (modelBrand === 'FUKAI') {
        return includeGroupPortfolioInS1 || normFilter === 'FUKAI';
      }
      if (modelBrand === 'NA_TELE') {
        return includeGroupPortfolioInS1 || normFilter === 'NA_TELE';
      }
      if (modelBrand !== 'BORNERS') {
        return false;
      }
      if (!includeGroupPortfolioInS1 && isUnverifiedActingSku(m.code)) {
        return false;
      }
      return true;
    }

    if (modelBrand === 'AKUSHA' || modelBrand === 'LISKANI') {
      return false;
    }

    return (
      scenario.includedBrands.includes(m.brandId) ||
      (modelBrand === 'NA_TELE' && scenario.includedBrands.includes('NA_TELE')) ||
      modelBrand === 'FUKAI'
    );
  });
}

export function mergeCloudPortfolioSnapshot(params: {
  localModels: ScenarioModelSpec[];
  cloudModels: ScenarioModelSpec[];
  localUpdatedAtIso?: string | null;
  cloudUpdatedAtIso?: string | null;
  deletedRegistry?: string[];
}): {
  models: ScenarioModelSpec[];
  shouldPushLocalToCloud: boolean;
} {
  const deletedReg = params.deletedRegistry ?? getDeletedModelsRegistry();
  const cloudHadDeletedModels = (params.cloudModels || []).some(
    (cm) => Boolean(cm && cm.id && cm.code && isModelMarkedDeleted(cm, deletedReg))
  );

  const isAcceptableModel = (m: ScenarioModelSpec | null | undefined): m is ScenarioModelSpec => {
    if (!m || !m.id || !m.code) return false;
    if (
      ['scen-model-001', 'scen-model-002', 'scen-model-003', 'scen-model-004'].includes(m.id) ||
      ['№001', '№002', '№003', '№004'].includes(m.code)
    ) {
      return false;
    }
    if (isLegacyPlaceholderLiskani(m) || isLegacyPlaceholderAkusha(m)) return false;
    if (isModelMarkedDeleted(m, deletedReg)) return false;
    return true;
  };

  const cleanLocal = (params.localModels || [])
    .filter(isAcceptableModel)
    .map((raw) => {
      const explicitEmptyGallery = Array.isArray(raw.gallery) && raw.gallery.length === 0;
      const normalized = ensureModelUnifiedV11(applyCategoryWbUnitEconomics(raw));
      return explicitEmptyGallery ? { ...normalized, gallery: [] } : normalized;
    });

  const cleanCloud = (params.cloudModels || [])
    .filter(isAcceptableModel)
    .map((raw) => {
      const upgraded = upgradeUnadjustedRawS1SalesPlan(raw).updated;
      const explicitEmptyGallery =
        Array.isArray(upgraded.gallery) && upgraded.gallery.length === 0;
      const normalized = ensureModelUnifiedV11(applyCategoryWbUnitEconomics(upgraded));
      return explicitEmptyGallery ? { ...normalized, gallery: [] } : normalized;
    });

  const localTs = params.localUpdatedAtIso ? Date.parse(params.localUpdatedAtIso) : NaN;
  const cloudTs = params.cloudUpdatedAtIso ? Date.parse(params.cloudUpdatedAtIso) : NaN;
  const isLocalNewer =
    Number.isFinite(localTs) && (!Number.isFinite(cloudTs) || localTs >= cloudTs);

  if (isLocalNewer) {
    const merged = [...cleanLocal];
    for (const cm of cleanCloud) {
      const exists = merged.some(
        (m) =>
          m.id === cm.id || m.code.trim().toUpperCase() === cm.code.trim().toUpperCase()
      );
      if (!exists) {
        merged.push(cm);
      }
    }
    return {
      models: merged,
      shouldPushLocalToCloud: true,
    };
  }

  const merged = [...cleanCloud];
  let addedLocalMissingInCloud = false;

  for (const lm of cleanLocal) {
    const exists = merged.some(
      (m) =>
        m.id === lm.id || m.code.trim().toUpperCase() === lm.code.trim().toUpperCase()
    );
    if (!exists) {
      merged.push(lm);
      addedLocalMissingInCloud = true;
    }
  }

  for (const baselineMod of [
    ...ACTING_2027_SCENARIO_MODELS,
    ...CLIENT_SAVED_S1_MODELS,
    ...LISKANI_2027_MODELS,
    ...AKUSHA_2027_MODELS,
  ]) {
    if (isModelMarkedDeleted(baselineMod, deletedReg)) continue;
    const idx = merged.findIndex(
      (m) =>
        m.id === baselineMod.id ||
        m.code.trim().toUpperCase() === baselineMod.code.trim().toUpperCase() ||
        m.title.trim().toUpperCase() === baselineMod.title.trim().toUpperCase()
    );
    if (idx < 0) {
      merged.push(ensureModelUnifiedV11(applyCategoryWbUnitEconomics(baselineMod)));
    } else if (
      (!merged[idx].liskaniSizeVariants || merged[idx].liskaniSizeVariants!.length === 0) &&
      baselineMod.liskaniSizeVariants &&
      baselineMod.liskaniSizeVariants.length > 0
    ) {
      merged[idx] = ensureModelUnifiedV11(
        applyCategoryWbUnitEconomics({
          ...baselineMod,
          ...merged[idx],
          liskaniSizeVariants: baselineMod.liskaniSizeVariants,
          plansByScenario: {
            ...baselineMod.plansByScenario,
            ...merged[idx].plansByScenario,
            [LISKANI_2027_SCENARIO_ID]:
              baselineMod.plansByScenario[LISKANI_2027_SCENARIO_ID],
          },
        })
      );
    }
  }

  return {
    models: merged,
    shouldPushLocalToCloud: addedLocalMissingInCloud || cloudHadDeletedModels,
  };
}

export function isBrandScenarioExplicitlyNone(
  brandInput: string,
  selectedScenarioByBrand?: Partial<Record<CanonicalBrandCode, number | null>> | Record<string, number | null> | null
): boolean {
  if (!selectedScenarioByBrand) return false;
  const code = normalizePortfolioBrandCode(brandInput);
  if (code === 'ALL') return false;
  return (
    Object.prototype.hasOwnProperty.call(selectedScenarioByBrand, code) &&
    (selectedScenarioByBrand as Record<string, number | null | undefined>)[code] === null
  );
}

export function resolveEffectiveScenarioForModel(
  model: ScenarioModelSpec,
  scenarios: GrowthScenarioDef[],
  selectedScenarioByBrand: Partial<Record<CanonicalBrandCode, number | null>> | Record<string, number | null> | undefined,
  fallbackScenario: GrowthScenarioDef,
  includeGroupPortfolioInS1 = false
): GrowthScenarioDef {
  const modelBrand = normalizePortfolioBrandCode(detectModelBrandPortfolioLabel(model));
  const activeScenarios = scenarios.filter((s) => !s.isArchived);

  // Если текущий fallbackScenario явно принадлежит бренду модели или является единым сценарием,
  // в котором модель уже проходит строгую фильтрацию без подмены чужого бренда
  if (
    fallbackScenario &&
    !fallbackScenario.isArchived &&
    filterModelsForScenario([model], fallbackScenario, includeGroupPortfolioInS1, 'ALL').length > 0
  ) {
    const ownerNorm = fallbackScenario.ownerBrandCode
      ? normalizePortfolioBrandCode(fallbackScenario.ownerBrandCode)
      : 'ALL';
    if (
      modelBrand === 'BORNERS' ||
      ownerNorm === modelBrand ||
      (fallbackScenario.id !== 1 && isScenarioCompatibleWithBrand(fallbackScenario, modelBrand))
    ) {
      return fallbackScenario;
    }
  }

  if (modelBrand !== 'ALL' && selectedScenarioByBrand) {
    const mappedId = (selectedScenarioByBrand as Record<string, number | null | undefined>)[modelBrand];
    if (typeof mappedId === 'number') {
      const mapped = activeScenarios.find((s) => s.id === mappedId);
      if (mapped && isScenarioCompatibleWithBrand(mapped, modelBrand)) {
        return mapped;
      }
    }
  }

  if (modelBrand === 'AKUSHA') {
    return activeScenarios.find((s) => s.id === AKUSHA_2027_SCENARIO_ID) || fallbackScenario;
  }
  if (modelBrand === 'LISKANI') {
    return activeScenarios.find((s) => s.id === LISKANI_2027_SCENARIO_ID) || fallbackScenario;
  }
  if (modelBrand === 'FUKAI') {
    return activeScenarios.find((s) => s.id === ACTING_2027_SCENARIO_ID) || fallbackScenario;
  }
  if (modelBrand === 'NA_TELE') {
    return (
      activeScenarios.find(
        (s) => s.ownerBrandCode && normalizePortfolioBrandCode(s.ownerBrandCode) === 'NA_TELE'
      ) ||
      activeScenarios.find((s) => s.id === 2) ||
      activeScenarios.find((s) => isScenarioCompatibleWithBrand(s, 'NA_TELE')) ||
      fallbackScenario
    );
  }

  return activeScenarios.find((s) => s.id === 1) || fallbackScenario;
}
