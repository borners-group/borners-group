import {
  type GrowthScenarioDef,
  type ModelPriorityLevel,
  type ScenarioModelSpec,
} from './scenarioData.ts';
import {
  ACTING_2027_SCENARIO_ID,
  ACTING_2027_SCENARIO_MODELS,
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
} from './scenarioS1_100M.ts';
import {
  type CanonicalBrandCode,
  applyCategoryWbUnitEconomics,
  applyCategoryWbUnitEconomicsToPortfolio,
  ensureModelUnifiedV11,
  isScenarioCompatibleWithBrand,
} from './unifiedBusinessEngine.ts';
import { safeGetStorageJson, safeSetStorageJson } from './safeStorage.ts';

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
export const MIGRATION_KEY_LISKANI_269_V3 = 'borners_liskani_269_official_migrated_v3';
export const MIGRATION_KEY_AKUSHA_2027_V1 = 'borners_akusha_2027_official_migrated_v1';
export const MIGRATION_KEY_BORNERS_SCENARIO_REPAIR_V1 = 'borners_sales_scenario_repair_v1';

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

  // Постоянная защита от записи чужого сценария (202706 / 202705) в BORNERS
  const savedByBrand = safeGetStorageJson<Record<string, number | null>>(
    STORAGE_KEY_SCENARIO_BY_BRAND
  );
  if (savedByBrand && typeof savedByBrand === 'object') {
    const sanitized = sanitizeSelectedScenarioByBrand(savedByBrand);
    const shouldResetActingFromStaleBug =
      alreadyMigrated !== '1' && sanitized.BORNERS === ACTING_2027_SCENARIO_ID;
    const finalByBrand = shouldResetActingFromStaleBug
      ? { ...sanitized, BORNERS: 1 }
      : sanitized;
    if (
      finalByBrand.BORNERS !== savedByBrand.BORNERS ||
      finalByBrand.FUKAI !== savedByBrand.FUKAI ||
      finalByBrand.LISKANI !== savedByBrand.LISKANI ||
      finalByBrand.AKUSHA !== savedByBrand.AKUSHA
    ) {
      safeSetStorageJson(STORAGE_KEY_SCENARIO_BY_BRAND, finalByBrand);
    }
  }

  if (alreadyMigrated === '1') return;

  // Сбрасываем залипший чужой или исходный сценарий в активном ключе на эталонный Сценарий №1 (686,28 млн ₽)
  const savedActiveId = safeGetStorageJson<number>(STORAGE_KEY_ACTIVE_SCENARIO_ID);
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
  priority?: ModelPriorityLevel;
  launchStatus: ScenarioModelSpec['launchStatus'];
  gallery?: ScenarioModelSpec['gallery'];
  palettes?: ScenarioModelSpec['palettes'];
  fabric?: ScenarioModelSpec['fabric'];
  construction?: ScenarioModelSpec['construction'];
  waistband?: ScenarioModelSpec['waistband'];
  attachedPdfs?: ScenarioModelSpec['attachedPdfs'];
  liskaniSizeVariants?: ScenarioModelSpec['liskaniSizeVariants'];
  plansByScenario: ScenarioModelSpec['plansByScenario'];
  sharedSupplyAndFact?: ScenarioModelSpec['sharedSupplyAndFact'];
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
  model: Pick<ScenarioModelSpec, 'id' | 'code'>
): void {
  const prev = getDeletedModelsRegistry();
  const next = new Set(prev.map((x) => x.toUpperCase()));
  if (model.id) next.add(model.id.toUpperCase());
  if (model.code) next.add(model.code.trim().toUpperCase());
  safeSetStorageJson(STORAGE_KEY_DELETED_MODELS, Array.from(next));
}

export function unmarkModelAsDeletedInStorage(
  model: Pick<ScenarioModelSpec, 'id' | 'code'>
): void {
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

export function syncUserPlansBackup(modelsList: ScenarioModelSpec[]): void {
  const deletedReg = getDeletedModelsRegistry();
  const prevBackup =
    safeGetStorageJson<Record<string, UserSavedModelPlanBackup>>(
      STORAGE_KEY_USER_PLANS_BACKUP
    ) || {};

  const backup: Record<string, UserSavedModelPlanBackup> = {};
  // Сохраняем все ранее созданные пользователем модели из prevBackup, если они не помечены удалёнными
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

  for (const raw of modelsList) {
    if (isModelMarkedDeleted(raw, deletedReg)) continue;
    const m = ensureModelUnifiedV11(raw);
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
      priority: m.priority,
      launchStatus: m.launchStatus,
      gallery: Array.isArray(raw.gallery) && raw.gallery.length === 0 ? [] : m.gallery,
      palettes: Array.isArray(raw.palettes) && raw.palettes.length === 0 ? [] : m.palettes,
      fabric: m.fabric,
      construction: m.construction,
      waistband: m.waistband,
      attachedPdfs: m.attachedPdfs,
      liskaniSizeVariants: m.liskaniSizeVariants,
      plansByScenario: m.plansByScenario,
      sharedSupplyAndFact: m.sharedSupplyAndFact,
    };
  }
  safeSetStorageJson(STORAGE_KEY_USER_PLANS_BACKUP, backup);
}

export function overlayBackupOntoModels(
  modelsList: ScenarioModelSpec[]
): ScenarioModelSpec[] {
  const backup = safeGetStorageJson<Record<string, UserSavedModelPlanBackup>>(
    STORAGE_KEY_USER_PLANS_BACKUP
  );
  const deletedReg = getDeletedModelsRegistry();

  const overlaid = modelsList
    .filter((m) => !isModelMarkedDeleted(m, deletedReg))
    .map((rawM) => {
      const m = ensureModelUnifiedV11(applyCategoryWbUnitEconomics(rawM));
      if (!backup || typeof backup !== 'object') return m;

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
        Array.isArray(saved.gallery) && saved.gallery.length === 0;
      const explicitEmptyPalettes =
        Array.isArray(saved.palettes) && saved.palettes.length === 0;

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
        priority: saved.priority ?? m.priority,
        launchStatus: saved.launchStatus ?? m.launchStatus,
        gallery: Array.isArray(saved.gallery) ? saved.gallery : m.gallery,
        palettes: Array.isArray(saved.palettes) ? saved.palettes : m.palettes,
        fabric: saved.fabric || m.fabric,
        construction: saved.construction || m.construction,
        waistband: saved.waistband || m.waistband,
        attachedPdfs: saved.attachedPdfs || m.attachedPdfs,
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
        responsiblePerson: 'Владелец бренда',
        priority: saved.priority || 'Высокий',
        hasActualSalesOrPurchases: false,
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
        productionSteps: [],
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
  safeSetStorageJson(STORAGE_KEY_MODELS, clean);
  syncUserPlansBackup(clean);
  return clean;
}

export function deleteModelFromPortfolio(
  modelsList: ScenarioModelSpec[],
  modelToDelete: Pick<ScenarioModelSpec, 'id' | 'code'>
): ScenarioModelSpec[] {
  markModelAsDeletedInStorage(modelToDelete);
  const remaining = modelsList.filter(
    (m) =>
      m.id !== modelToDelete.id &&
      m.code.trim().toUpperCase() !== modelToDelete.code.trim().toUpperCase()
  );
  safeSetStorageJson(STORAGE_KEY_MODELS, remaining);
  syncUserPlansBackup(remaining);
  return remaining;
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
          (!merged[idx].attachedPdfs || merged[idx].attachedPdfs.length === 0) &&
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

    const hydrated = overlayBackupOntoModels(merged);
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
