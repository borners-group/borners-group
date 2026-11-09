import {
  type ModelPriorityLevel,
  type ScenarioModelSpec,
} from './scenarioData.ts';
import {
  ACTING_2027_SCENARIO_MODELS,
} from './actingAssortment2027.ts';
import {
  LISKANI_2027_MODELS,
  LISKANI_2027_SCENARIO_ID,
} from './liskaniAssortment2027.ts';
import {
  S1_100M_SCENARIO_MODELS,
  applyClientSavedS1SalesPlan,
} from './scenarioS1_100M.ts';
import {
  applyCategoryWbUnitEconomics,
  applyCategoryWbUnitEconomicsToPortfolio,
  ensureModelUnifiedV11,
} from './unifiedBusinessEngine.ts';
import { safeGetStorageJson, safeSetStorageJson } from './safeStorage.ts';

export const STORAGE_KEY_SCENARIOS = 'borners_tz_scenarios_v1';
export const STORAGE_KEY_MODELS = 'borners_tz_models_v1';
export const STORAGE_KEY_USER_PLANS_BACKUP = 'borners_user_saved_plans_v1';
export const STORAGE_KEY_ACTIVE_SCENARIO_ID = 'borners_active_scenario_id_v1';
export const STORAGE_KEY_S1_GROUP_PORTFOLIO = 'borners_s1_include_fukai_v1';
export const STORAGE_KEY_SCENARIO_BY_BRAND = 'borners_selected_scenario_by_brand_v1';
export const STORAGE_KEY_DELETED_MODELS = 'borners_deleted_model_ids_v1';

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
  const backup: Record<string, UserSavedModelPlanBackup> = {};
  for (const raw of modelsList) {
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

  return modelsList
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
        (!saved.plansByScenario?.[LISKANI_2027_SCENARIO_ID] ||
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
  const deletedReg = getDeletedModelsRegistry();
  const parsedModels = safeGetStorageJson<ScenarioModelSpec[]>(STORAGE_KEY_MODELS);

  const isLegacyPlaceholderLiskani = (m: ScenarioModelSpec): boolean => {
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
    if (
      /^LSC-0(0[1-9]|[12]\d|3[0-3])$/.test(codeU) &&
      (!m.liskaniSizeVariants || m.liskaniSizeVariants.length === 0)
    ) {
      return true;
    }
    return false;
  };

  if (Array.isArray(parsedModels) && parsedModels.length > 0) {
    const filteredLegacy = parsedModels.filter(
      (m) =>
        !['scen-model-001', 'scen-model-002', 'scen-model-003', 'scen-model-004'].includes(
          m.id
        ) &&
        !['№001', '№002', '№003', '№004'].includes(m.code) &&
        !isLegacyPlaceholderLiskani(m) &&
        !isModelMarkedDeleted(m, deletedReg)
    );

    const merged = [...filteredLegacy];
    for (const itemMod of [
      ...ACTING_2027_SCENARIO_MODELS,
      ...S1_100M_SCENARIO_MODELS,
      ...LISKANI_2027_MODELS,
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

    return overlayBackupOntoModels(merged);
  }

  const defaultList = applyCategoryWbUnitEconomicsToPortfolio(
    applyClientSavedS1SalesPlan([
      ...ACTING_2027_SCENARIO_MODELS,
      ...S1_100M_SCENARIO_MODELS,
      ...LISKANI_2027_MODELS,
    ])
  ).filter((m) => !isModelMarkedDeleted(m, deletedReg));

  return overlayBackupOntoModels(defaultList);
}
