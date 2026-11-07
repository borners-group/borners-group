'use client';

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  AppUser,
  AuditLogEntry,
  Brand,
  BrandFilter,
  Campaign,
  Competitor,
  ConceptStage,
  DocumentItem,
  FinancialPlanRow,
  FinancialScenario,
  GrowthExperiment,
  Launch,
  MarketOpportunity,
  MiroBoardItem,
  NavSectionId,
  PeriodFilter,
  PlatformMode,
  Product,
  ProductConcept,
  Project,
  ResearchItem,
  StrategicGoal,
  StrategyBlock,
  TaskItem,
  TaskStatus,
} from '@/types/platform';
import {
  INITIAL_AUDIT_LOG,
  INITIAL_BRANDS,
  INITIAL_CAMPAIGNS,
  INITIAL_COMPETITORS,
  INITIAL_CONCEPTS,
  INITIAL_DOCUMENTS,
  INITIAL_EXPERIMENTS,
  INITIAL_FINANCIAL_PLANS,
  INITIAL_LAUNCHES,
  INITIAL_OPPORTUNITIES,
  INITIAL_PRODUCTS,
  INITIAL_PROJECTS,
  INITIAL_RESEARCH,
  INITIAL_STRATEGIC_GOALS,
  INITIAL_TASKS,
  INITIAL_USERS,
} from '@/lib/initial-data';
import { INITIAL_STRATEGIES } from '@/lib/initial-strategies';
import {
  ACTING_2027_CATALOG_PRODUCTS,
  verifyActingAssortment2027Bundle,
} from '@/lib/actingAssortment2027';
import {
  S1_100M_CATALOG_PRODUCTS,
  verifyScenarioS1_100M,
} from '@/lib/scenarioS1_100M';
import {
  CONCEPT_STAGE_LABELS_RU,
  ROLE_LABELS_RU,
  TASK_STATUS_LABELS_RU,
  shiftDateString,
} from '@/lib/finance';
import {
  cleanupLegacyStorageKeys,
  safeSetStorageJson,
  stripOversizedDataUrls,
} from '@/lib/safeStorage';

const STORAGE_KEY = 'borners_group_platform_state_ru_v9_editorial';
const AUTH_STORAGE_KEY = 'borners_group_auth_session_ru_v4';

interface PersistedState {
  users: AppUser[];
  brands: Brand[];
  strategies: StrategyBlock[];
  concepts: ProductConcept[];
  products: Product[];
  launches: Launch[];
  financialPlans: FinancialPlanRow[];
  campaigns: Campaign[];
  experiments: GrowthExperiment[];
  competitors: Competitor[];
  opportunities: MarketOpportunity[];
  research: ResearchItem[];
  strategicGoals: StrategicGoal[];
  projects: Project[];
  tasks: TaskItem[];
  documents: DocumentItem[];
  auditLog: AuditLogEntry[];
  miroItems: MiroBoardItem[];
  presentationOverrides: Record<string, string>;
}

interface ToastMessage {
  id: string;
  type: 'success' | 'warning' | 'error';
  title: string;
  description?: string;
}

interface PlatformContextValue extends PersistedState {
  // Авторизация и пользователь
  isAuthenticated: boolean;
  currentUser: AppUser;
  loginAs: (userId: string) => void;
  logout: () => void;
  updateUserRoleOrPermissions: (userId: string, patch: Partial<AppUser>) => void;

  // Глобальные переключатели и навигация
  activeSection: NavSectionId;
  navHistory: NavSectionId[];
  canGoBack: boolean;
  canGoForward: boolean;
  navigateTo: (
    section: NavSectionId,
    opts?: {
      productId?: string;
      conceptId?: string;
      launchId?: string;
      brandId?: BrandFilter;
      scenarioScreen?: 'scenarios' | 'model' | 'sales-plan';
      scenarioModelId?: string;
    }
  ) => void;
  pushScenarioStep: (
    screen: 'scenarios' | 'model' | 'sales-plan',
    modelId?: string
  ) => void;
  goBack: () => void;
  goForward: () => void;
  brandFilter: BrandFilter;
  setBrandFilter: (brand: BrandFilter) => void;
  periodFilter: PeriodFilter;
  setPeriodFilter: (period: PeriodFilter) => void;
  platformMode: PlatformMode;
  setPlatformMode: (mode: PlatformMode) => void;
  simpleMode: boolean;
  setSimpleMode: (simple: boolean) => void;
  financialScenario: FinancialScenario;
  setFinancialScenario: (scenario: FinancialScenario) => void;
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;

  // Выбранные связанные объекты (единая синхронизация во всех разделах, п. 18, 25 ТЗ)
  selectedProductId: string | null;
  setSelectedProductId: (id: string | null) => void;
  selectedConceptId: string | null;
  setSelectedConceptId: (id: string | null) => void;
  selectedLaunchId: string | null;
  setSelectedLaunchId: (id: string | null) => void;

  // Уведомления и ошибки сохранения
  toasts: ToastMessage[];
  notify: (type: ToastMessage['type'], title: string, description?: string) => void;
  dismissToast: (id: string) => void;

  // Мутации данных
  createConcept: (input: Partial<ProductConcept> & { name: string; brandId: string }) => ProductConcept;
  updateConcept: (id: string, patch: Partial<ProductConcept>) => void;
  updateConceptStage: (id: string, stage: ConceptStage, reason?: string) => void;
  deleteConcept: (id: string) => void;
  createProductFromConcept: (conceptId: string) => Product | null;
  createProduct: (input: Partial<Product> & { name: string; sku: string; brandId: string }) => Product;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  archiveEntity: (type: 'product' | 'concept' | 'launch' | 'task' | 'document', id: string) => void;
  createLaunch: (input: {
    name: string;
    brandId: string;
    collectionName: string;
    productId?: string;
    conceptId?: string;
    startDate: string;
    marketingBudgetRub: number;
    salesPlanUnits: number;
    salesPlanRub: number;
    ownerId: string;
  }) => Launch;
  updateLaunch: (id: string, patch: Partial<Launch>) => void;
  rescheduleLaunch: (launchId: string, newStartDate: string, shiftDependentDates: boolean) => void;
  createTask: (input: {
    title: string;
    description?: string;
    brandId: string;
    projectId?: string;
    productId?: string;
    conceptId?: string;
    launchId?: string;
    assigneeId: string;
    priority: TaskItem['priority'];
    deadline: string;
  }) => TaskItem;
  updateTask: (id: string, patch: Partial<TaskItem>) => void;
  updateTaskStatus: (id: string, status: TaskStatus) => void;
  updateStrategyBlock: (id: string, patch: Partial<StrategyBlock>, comment?: string) => void;
  updateFinancialPlanRow: (id: string, patch: Partial<FinancialPlanRow>) => void;
  addFinancialPlanRow: (row: Omit<FinancialPlanRow, 'id' | 'updatedAt' | 'updatedBy'>) => void;
  createCampaign: (input: Omit<Campaign, 'id' | 'isDemo' | 'isArchived'>) => void;
  updateCampaign: (id: string, patch: Partial<Campaign>) => void;
  createExperiment: (input: Omit<GrowthExperiment, 'id' | 'isDemo'>) => void;
  updateExperiment: (id: string, patch: Partial<GrowthExperiment>) => void;
  createCompetitor: (input: Omit<Competitor, 'id' | 'isDemo'>) => void;
  createResearch: (input: Omit<ResearchItem, 'id' | 'isDemo'>) => void;
  createDocument: (input: Omit<DocumentItem, 'id' | 'uploadedAt' | 'uploadedBy' | 'isArchived'>) => void;
  updateDocument: (id: string, patch: Partial<DocumentItem>) => void;
  restoreEntity: (type: 'product' | 'concept' | 'launch' | 'task' | 'document', id: string) => void;
  permanentlyDeleteEntity: (type: 'product' | 'concept' | 'launch' | 'task' | 'document', id: string) => void;
  emptyTrash: () => void;
  createMiroItem: (input: Omit<MiroBoardItem, 'id' | 'createdAt' | 'authorName'>) => MiroBoardItem;
  updateMiroItem: (id: string, patch: Partial<MiroBoardItem>) => void;
  deleteMiroItem: (id: string) => void;
  updatePresentationOverride: (key: string, value: string) => void;
  resetPresentationOverrides: () => void;
  updateBrand: (brandId: string, patch: Partial<Brand>) => void;
  updateBrandPalette: (brandId: string, accentColor: string, secondaryColor: string) => void;
  createBrand: (input: { code: string; name: string; tagline: string; segment: string; accentColor: string }) => void;
  resetToDemoDefaults: () => void;
}

const INITIAL_MIRO_ITEMS: MiroBoardItem[] = [
  {
    id: 'miro-1',
    type: 'sticky',
    title: 'Фокус Q1 2027 · Матрица 70/30',
    content: 'Удерживаем 70% оборота на базовых комплектах (3 шт.) и 30% на сезонных дропах BIG LOVE и капсуле НА ТЕЛЕ.',
    brandId: 'ALL',
    color: '#FFF8D6',
    x: 40,
    y: 50,
    width: 280,
    connectedToIds: ['miro-2', 'miro-4'],
    authorName: 'Алексей Морозов',
    createdAt: '2026-10-30',
  },
  {
    id: 'miro-2',
    type: 'photo',
    title: 'Референс выкладки BORNERS Core Modal',
    content: 'Лицевая фотография и фактура микромодала 180 г/м² для фабрики Guangdong Apex.',
    brandId: 'BORNERS',
    color: '#FAF8F5',
    x: 400,
    y: 40,
    width: 300,
    imageUrl: 'images/products/borners-editorial-hero.jpg',
    galleryUrls: ['images/products/borners-editorial-hero.jpg', 'images/products/rnd-soft-boxers.jpg'],
    connectedToIds: ['miro-3'],
    authorName: 'Дмитрий Волков',
    createdAt: '2026-10-31',
  },
  {
    id: 'miro-3',
    type: 'photo',
    title: 'Капсула НА ТЕЛЕ · Вторая кожа',
    content: 'Палитра телесных оттенков (Warm Oat, Almond, Espresso) — согласованы выкрасы Lab Dip.',
    brandId: 'NA_TELE',
    color: '#FAF8F5',
    x: 780,
    y: 60,
    width: 300,
    imageUrl: 'images/products/natele-editorial-hero.jpg',
    galleryUrls: ['images/products/natele-editorial-hero.jpg', 'images/products/rnd-seamless-base.jpg'],
    connectedToIds: [],
    authorName: 'Елена Смирнова',
    createdAt: '2026-10-31',
  },
  {
    id: 'miro-4',
    type: 'concept_link',
    title: 'В приоритете R&D · Мягкие боксеры',
    content: 'Проверить протокол 4 проверок после 5 циклов стирки и выгрузить PDF с китайским переводом.',
    brandId: 'NA_TELE',
    color: '#E6F4EE',
    x: 80,
    y: 330,
    width: 290,
    linkedConceptId: 'concept-soft-boxers',
    connectedToIds: ['miro-2'],
    authorName: 'Елена Смирнова',
    createdAt: '2026-11-01',
  },
];

const DEFAULT_STATE: PersistedState = {
  users: INITIAL_USERS,
  brands: INITIAL_BRANDS,
  strategies: INITIAL_STRATEGIES,
  concepts: INITIAL_CONCEPTS,
  products: [
    ...S1_100M_CATALOG_PRODUCTS,
    ...ACTING_2027_CATALOG_PRODUCTS,
    ...INITIAL_PRODUCTS,
  ],
  launches: INITIAL_LAUNCHES,
  financialPlans: INITIAL_FINANCIAL_PLANS,
  campaigns: INITIAL_CAMPAIGNS,
  experiments: INITIAL_EXPERIMENTS,
  competitors: INITIAL_COMPETITORS,
  opportunities: INITIAL_OPPORTUNITIES,
  research: INITIAL_RESEARCH,
  strategicGoals: INITIAL_STRATEGIC_GOALS,
  projects: INITIAL_PROJECTS,
  tasks: INITIAL_TASKS,
  documents: INITIAL_DOCUMENTS,
  auditLog: INITIAL_AUDIT_LOG,
  miroItems: INITIAL_MIRO_ITEMS,
  presentationOverrides: {},
};

let uniqueIdSeq = 0;
function makeUniqueId(prefix: string): string {
  uniqueIdSeq += 1;
  return `${prefix}-${Date.now()}-${uniqueIdSeq}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Автоматически убирает дубликаты товаров в каталоге (например, возникшие при совпадении Date.now() ID)
 * и гарантирует уникальность каждого product.id, чтобы удаление и редактирование работали с 1 клика.
 */
function deduplicateAndHealProducts(products: Product[]): Product[] {
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const result: Product[] = [];

  const bornersDataUrls = new Set(
    products
      .filter((p) => p && p.brandId === 'BORNERS' && p.imageUrl?.startsWith('data:image/'))
      .map((p) => p.imageUrl)
  );

  for (const raw of products) {
    if (!raw) continue;
    const keySku = `${raw.brandId}:${(raw.sku || '').trim().toUpperCase()}`;
    const keyName = `${raw.brandId}:${(raw.name || '').trim().toUpperCase()}`;

    if (seenKeys.has(keySku) || seenKeys.has(keyName)) {
      continue;
    }
    seenKeys.add(keySku);
    seenKeys.add(keyName);

    let id = raw.id;
    if (!id || seenIds.has(id)) {
      id = makeUniqueId('prod');
    }
    seenIds.add(id);

    // Если при старом совпадении ID (prod-${Date.now()}) карточка НА ТЕЛЕ (SECOND SKIN SET)
    // случайно унаследовала чужое фото боксеров BORNERS, восстанавливаем её штатный визуал
    let imageUrl = raw.imageUrl;
    if (
      raw.brandId === 'NA_TELE' &&
      imageUrl &&
      bornersDataUrls.has(imageUrl)
    ) {
      imageUrl = 'images/products/natele-milky-black.svg';
    }

    result.push({
      ...raw,
      id,
      imageUrl,
    });
  }

  return result;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const [currentUserId, setCurrentUserId] = useState<string>('user-owner');

  const [activeSection, setActiveSection] = useState<NavSectionId>('dashboard');
  const [navHistory, setNavHistory] = useState<NavSectionId[]>(['dashboard']);
  const [historyState, setHistoryState] = useState<{
    stack: {
      section: NavSectionId;
      platformMode: PlatformMode;
      brandFilter?: BrandFilter;
      productId?: string | null;
      conceptId?: string | null;
      launchId?: string | null;
      scenarioScreen?: 'scenarios' | 'model' | 'sales-plan';
      scenarioModelId?: string;
    }[];
    cursor: number;
  }>({
    stack: [{ section: 'dashboard', platformMode: 'management' }],
    cursor: 0,
  });
  const historyStackRef = useRef(historyState.stack);
  const historyCursorRef = useRef(0);
  const [brandFilter, setBrandFilter] = useState<BrandFilter>('ALL');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('2027');
  const [platformMode, setPlatformMode] = useState<PlatformMode>('management');
  const [simpleMode, setSimpleMode] = useState<boolean>(true);
  const [financialScenario, setFinancialScenario] = useState<FinancialScenario>('Base');
  const [darkMode, setDarkMode] = useState<boolean>(false);

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [selectedLaunchId, setSelectedLaunchId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Восстановление состояния из localStorage без потери данных при перезагрузке и выходе/входе
  useEffect(() => {
    try {
      cleanupLegacyStorageKeys();
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        let normalized = saved.replaceAll('"/images/products/', '"images/products/');
        for (const base of ['rnd-seamless-hero', 'rnd-print-family', 'rnd-seamless-base', 'rnd-soft-boxers']) {
          normalized = normalized.replaceAll(`images/products/${base}.png`, `images/products/${base}.jpg`);
        }
        const rawParsed = JSON.parse(normalized) as Partial<PersistedState>;
        const parsed =
          normalized.length > 1_500_000
            ? stripOversizedDataUrls(rawParsed, 70_000)
            : rawParsed;
        const catalogSeeded = window.localStorage.getItem(
          'borners_acting_2027_catalog_seeded_v1'
        );
        const s1CatalogSeeded = window.localStorage.getItem(
          'borners_s1_100m_catalog_seeded_v1'
        );
        const bundleCheck = verifyActingAssortment2027Bundle();
        const s1Check = verifyScenarioS1_100M();
        let nextProducts = parsed.products || DEFAULT_STATE.products;
        if ((!catalogSeeded && bundleCheck.valid) || (!s1CatalogSeeded && s1Check.valid)) {
          const merged = [...nextProducts];
          for (const itemProd of [
            ...S1_100M_CATALOG_PRODUCTS,
            ...ACTING_2027_CATALOG_PRODUCTS,
          ]) {
            const idx = merged.findIndex(
              (p) =>
                p.id === itemProd.id ||
                p.sku.toUpperCase() === itemProd.sku.toUpperCase() ||
                p.name.toUpperCase() === itemProd.name.toUpperCase()
            );
            if (idx === -1) {
              merged.unshift(itemProd);
            }
          }
          nextProducts = merged;
          try {
            window.localStorage.setItem('borners_acting_2027_catalog_seeded_v1', '1');
            window.localStorage.setItem('borners_s1_100m_catalog_seeded_v1', '1');
          } catch {
            // ignore
          }
        }
        setState((prev) => {
          const baseBrands = parsed.brands || prev.brands;
          const mergedBrands = [...baseBrands].map((b) =>
            b.code === 'BORNERS'
              ? { ...b, heroImage: 'images/products/borners-editorial-hero.jpg' }
              : b.code === 'NA_TELE'
              ? { ...b, heroImage: 'images/products/natele-editorial-hero.jpg' }
              : b.code === 'AKUSHA' || b.code === 'LISKANI'
              ? { ...b, isStrategyInDevelopment: false, statusNote: 'Активен' }
              : b
          );
          for (const initBrand of INITIAL_BRANDS) {
            if (!mergedBrands.some((b) => b.id === initBrand.id || b.code === initBrand.code)) {
              mergedBrands.push(initBrand);
            }
          }

          const baseUsers = parsed.users || prev.users;
          const allHoldingBrandIds = mergedBrands.map((b) => b.id);
          const mergedUsers = baseUsers.map((u) =>
            u.role === 'Owner' || u.role === 'Admin' || u.role === 'Viewer' || u.role === 'Partner'
              ? {
                  ...u,
                  assignedBrandIds: Array.from(
                    new Set([...(u.assignedBrandIds || []), ...allHoldingBrandIds])
                  ),
                }
              : u
          );

          return {
            ...prev,
            ...parsed,
            users: mergedUsers,
            products: deduplicateAndHealProducts(nextProducts),
            brands: mergedBrands,
            strategies: (parsed.strategies || prev.strategies).map((s, idx) => ({
              ...s,
              deadline: s.deadline || INITIAL_STRATEGIES[idx]?.deadline || '2027-01-15',
            })),
            miroItems: parsed.miroItems !== undefined
              ? parsed.miroItems.map((m) => {
                  if (m.connectedToIds) return m;
                  const fallback = INITIAL_MIRO_ITEMS.find((init) => init.id === m.id);
                  return { ...m, connectedToIds: fallback?.connectedToIds || [] };
                })
              : prev.miroItems,
            presentationOverrides: parsed.presentationOverrides || {},
          };
        });
      }
      const savedAuth = window.localStorage.getItem(AUTH_STORAGE_KEY);
      if (savedAuth) {
        const parsedAuth = JSON.parse(savedAuth) as {
          isAuthenticated: boolean;
          currentUserId: string;
        };
        setIsAuthenticated(parsedAuth.isAuthenticated);
        if (parsedAuth.currentUserId) setCurrentUserId(parsedAuth.currentUserId);
      }

      // Восстановление текущего раздела и выбранной карточки после перезагрузки (F5)
      const savedNav = window.localStorage.getItem('borners_ui_nav_state_v1');
      if (savedNav) {
        try {
          const parsedNav = JSON.parse(savedNav) as {
            activeSection?: NavSectionId;
            platformMode?: PlatformMode;
            brandFilter?: BrandFilter;
            selectedProductId?: string | null;
            selectedConceptId?: string | null;
            selectedLaunchId?: string | null;
          };
          if (parsedNav.activeSection) {
            setActiveSection(parsedNav.activeSection);
            setNavHistory([parsedNav.activeSection]);
            const initialStack = [
              {
                section: parsedNav.activeSection,
                platformMode: parsedNav.platformMode || ('management' as PlatformMode),
                brandFilter: parsedNav.brandFilter || 'ALL',
                productId: parsedNav.selectedProductId ?? null,
                conceptId: parsedNav.selectedConceptId ?? null,
                launchId: parsedNav.selectedLaunchId ?? null,
              },
            ];
            historyStackRef.current = initialStack;
            historyCursorRef.current = 0;
            setHistoryState({ stack: initialStack, cursor: 0 });
          }
          if (parsedNav.platformMode) setPlatformMode(parsedNav.platformMode);
          if (parsedNav.brandFilter) setBrandFilter(parsedNav.brandFilter);
          if (parsedNav.selectedProductId !== undefined)
            setSelectedProductId(parsedNav.selectedProductId);
          if (parsedNav.selectedConceptId !== undefined)
            setSelectedConceptId(parsedNav.selectedConceptId);
          if (parsedNav.selectedLaunchId !== undefined)
            setSelectedLaunchId(parsedNav.selectedLaunchId);
        } catch {
          // ignore invalid JSON
        }
      }

      setDarkMode(false);
    } catch (err) {
      console.error('Failed to hydrate state from localStorage:', err);
    } finally {
      setHydrated(true);
    }
  }, []);

  // Сохранение текущего маршрута навигации в localStorage, чтобы F5 оставлял на том же экране
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        'borners_ui_nav_state_v1',
        JSON.stringify({
          activeSection,
          platformMode,
          brandFilter,
          selectedProductId,
          selectedConceptId,
          selectedLaunchId,
        })
      );
    } catch {
      // ignore
    }
  }, [
    hydrated,
    activeSection,
    platformMode,
    brandFilter,
    selectedProductId,
    selectedConceptId,
    selectedLaunchId,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    safeSetStorageJson(STORAGE_KEY, state);
  }, [state, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ isAuthenticated, currentUserId, darkMode })
      );
    } catch (err) {
      console.error('Failed to persist auth session:', err);
    }
  }, [isAuthenticated, currentUserId, darkMode, hydrated]);

  const notify = useCallback(
    (type: ToastMessage['type'], title: string, description?: string) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const prefix = title.includes(':') ? title.split(':')[0].trim() : title;
      setToasts((prev) => {
        const filtered = prev.filter((t) => {
          const tPrefix = t.title.includes(':') ? t.title.split(':')[0].trim() : t.title;
          return t.title !== title && tPrefix !== prefix;
        });
        return [...filtered.slice(-1), { id, type, title, description }];
      });
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 2800);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const currentUser = useMemo(() => {
    return state.users.find((u) => u.id === currentUserId) || state.users[0];
  }, [state.users, currentUserId]);

  const appendAudit = useCallback(
    (
      entityType: AuditLogEntry['entityType'],
      entityId: string,
      action: string,
      summary: string
    ): AuditLogEntry => ({
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      actorName: currentUser.fullName,
      actorRole: currentUser.role,
      entityType,
      entityId,
      action,
      summary,
      createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    }),
    [currentUser]
  );

  const loginAs = useCallback(
    (userId: string) => {
      const targetUser = state.users.find((u) => u.id === userId);
      if (!targetUser) return;
      setCurrentUserId(targetUser.id);
      setIsAuthenticated(true);
      notify(
        'success',
        `Вы вошли как ${targetUser.fullName}`,
        `Роль: ${ROLE_LABELS_RU[targetUser.role]}`
      );
    },
    [state.users, notify]
  );

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    notify('warning', 'Сессия завершена', 'Все данные сохранены в хранилище. Войдите снова для продолжения работы.');
  }, [notify]);

  const updateUserRoleOrPermissions = useCallback(
    (userId: string, patch: Partial<AppUser>) => {
      setState((prev) => ({
        ...prev,
        users: prev.users.map((u) => (u.id === userId ? { ...u, ...patch } : u)),
        auditLog: [
          appendAudit('user', userId, 'updated', `Обновлены права пользователя (${Object.keys(patch).join(', ')})`),
          ...prev.auditLog,
        ],
      }));
      notify('success', 'Права пользователя обновлены');
    },
    [appendAudit, notify]
  );

  const applyHistoryEntry = useCallback(
    (entry: {
      section: NavSectionId;
      platformMode: PlatformMode;
      brandFilter?: BrandFilter;
      productId?: string | null;
      conceptId?: string | null;
      launchId?: string | null;
      scenarioScreen?: 'scenarios' | 'model' | 'sales-plan';
      scenarioModelId?: string;
    }) => {
      setPlatformMode(entry.platformMode || 'management');
      setActiveSection(entry.section);
      if (entry.brandFilter !== undefined) setBrandFilter(entry.brandFilter);
      if (entry.productId !== undefined) setSelectedProductId(entry.productId);
      if (entry.conceptId !== undefined) setSelectedConceptId(entry.conceptId);
      if (entry.launchId !== undefined) setSelectedLaunchId(entry.launchId);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('borners-history-restore', { detail: entry })
        );
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    []
  );

  // Синхронизация с браузерной историей (поддержка нативного свайпа двумя пальцами на тачпаде MacBook / ноутбука)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (typeof window.history.state?.bornersCursor !== 'number') {
        window.history.replaceState({ bornersCursor: 0 }, '');
      }
    } catch {
      // ignore
    }

    const onPopState = (e: PopStateEvent) => {
      const targetCursor = e.state?.bornersCursor;
      if (
        typeof targetCursor === 'number' &&
        targetCursor >= 0 &&
        targetCursor < historyStackRef.current.length &&
        targetCursor !== historyCursorRef.current
      ) {
        historyCursorRef.current = targetCursor;
        const targetEntry = historyStackRef.current[targetCursor];
        setHistoryState({
          stack: historyStackRef.current,
          cursor: targetCursor,
        });
        setNavHistory(
          historyStackRef.current
            .slice(0, targetCursor + 1)
            .map((item) => item.section)
        );
        applyHistoryEntry(targetEntry);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [applyHistoryEntry]);

  const navigateTo = useCallback(
    (
      section: NavSectionId,
      opts?: {
        productId?: string;
        conceptId?: string;
        launchId?: string;
        brandId?: BrandFilter;
        scenarioScreen?: 'scenarios' | 'model' | 'sales-plan';
        scenarioModelId?: string;
      }
    ) => {
      setPlatformMode('management');
      setActiveSection(section);
      if (opts?.brandId !== undefined) setBrandFilter(opts.brandId);
      if (opts?.productId !== undefined) setSelectedProductId(opts.productId);
      if (opts?.conceptId !== undefined) setSelectedConceptId(opts.conceptId);
      if (opts?.launchId !== undefined) setSelectedLaunchId(opts.launchId);

      const currentStack = historyStackRef.current;
      const currentCursor = historyCursorRef.current;
      const currentEntry = currentStack[currentCursor];

      const nextEntry = {
        section,
        platformMode: 'management' as PlatformMode,
        brandFilter: opts?.brandId,
        productId: opts?.productId,
        conceptId: opts?.conceptId,
        launchId: opts?.launchId,
        scenarioScreen:
          opts?.scenarioScreen ||
          (section === 'launch-calendar' ? 'sales-plan' : 'scenarios'),
        scenarioModelId: opts?.scenarioModelId,
      };

      const isSameAsCurrent =
        currentEntry &&
        currentEntry.section === nextEntry.section &&
        currentEntry.scenarioScreen === nextEntry.scenarioScreen &&
        currentEntry.scenarioModelId === nextEntry.scenarioModelId &&
        currentEntry.productId === nextEntry.productId &&
        currentEntry.conceptId === nextEntry.conceptId;

      if (!isSameAsCurrent) {
        const nextStack = [
          ...currentStack.slice(0, currentCursor + 1).slice(-30),
          nextEntry,
        ];
        const nextCursor = nextStack.length - 1;
        historyStackRef.current = nextStack;
        historyCursorRef.current = nextCursor;
        setHistoryState({ stack: nextStack, cursor: nextCursor });
        setNavHistory(nextStack.map((item) => item.section));

        if (typeof window !== 'undefined') {
          try {
            window.history.pushState(
              { bornersCursor: nextCursor },
              '',
              `#${section}${nextEntry.scenarioScreen ? `-${nextEntry.scenarioScreen}` : ''}`
            );
          } catch {
            // ignore
          }
        }
      }

      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    []
  );

  const pushScenarioStep = useCallback(
    (
      screen: 'scenarios' | 'model' | 'sales-plan',
      modelId?: string
    ) => {
      const currentStack = historyStackRef.current;
      const currentCursor = historyCursorRef.current;
      const currentEntry = currentStack[currentCursor];
      const sec = currentEntry?.section || activeSection;

      if (
        currentEntry &&
        currentEntry.section === sec &&
        currentEntry.scenarioScreen === screen &&
        currentEntry.scenarioModelId === modelId
      ) {
        return;
      }

      const nextEntry = {
        section: sec,
        platformMode: 'management' as PlatformMode,
        scenarioScreen: screen,
        scenarioModelId: modelId,
      };
      const nextStack = [
        ...currentStack.slice(0, currentCursor + 1).slice(-30),
        nextEntry,
      ];
      const nextCursor = nextStack.length - 1;
      historyStackRef.current = nextStack;
      historyCursorRef.current = nextCursor;
      setHistoryState({ stack: nextStack, cursor: nextCursor });
      setNavHistory(nextStack.map((item) => item.section));

      if (typeof window !== 'undefined') {
        try {
          window.history.pushState(
            { bornersCursor: nextCursor },
            '',
            `#${sec}-${screen}`
          );
        } catch {
          // ignore
        }
      }
    },
    [activeSection]
  );

  const goBack = useCallback(() => {
    const currentCursor = historyCursorRef.current;
    if (currentCursor <= 0) return;
    const targetCursor = currentCursor - 1;
    const targetEntry = historyStackRef.current[targetCursor];
    if (!targetEntry) return;

    historyCursorRef.current = targetCursor;
    setHistoryState({
      stack: historyStackRef.current,
      cursor: targetCursor,
    });
    setNavHistory(
      historyStackRef.current
        .slice(0, targetCursor + 1)
        .map((item) => item.section)
    );
    applyHistoryEntry(targetEntry);

    if (typeof window !== 'undefined') {
      try {
        if (
          typeof window.history.state?.bornersCursor === 'number' &&
          window.history.state.bornersCursor > targetCursor
        ) {
          window.history.back();
        }
      } catch {
        // ignore
      }
    }
  }, [applyHistoryEntry]);

  const goForward = useCallback(() => {
    const currentCursor = historyCursorRef.current;
    const currentStack = historyStackRef.current;
    if (currentCursor >= currentStack.length - 1) return;
    const targetCursor = currentCursor + 1;
    const targetEntry = currentStack[targetCursor];
    if (!targetEntry) return;

    historyCursorRef.current = targetCursor;
    setHistoryState({
      stack: currentStack,
      cursor: targetCursor,
    });
    setNavHistory(
      currentStack
        .slice(0, targetCursor + 1)
        .map((item) => item.section)
    );
    applyHistoryEntry(targetEntry);

    if (typeof window !== 'undefined') {
      try {
        if (
          typeof window.history.state?.bornersCursor === 'number' &&
          window.history.state.bornersCursor < targetCursor
        ) {
          window.history.forward();
        }
      } catch {
        // ignore
      }
    }
  }, [applyHistoryEntry]);

  const canGoBack = historyState.cursor > 0;
  const canGoForward = historyState.cursor < historyState.stack.length - 1;

  // 1. Создание концепции в Product Lab (п. 4, 6, 21 ТЗ Product Lab R&D)
  const createConcept = useCallback(
    (input: Partial<ProductConcept> & { name: string; brandId: string }): ProductConcept => {
      const id = makeUniqueId('concept');
      const nextNum = state.concepts.length + 21;
      const code = input.code || `RD-0${nextNum}`;
      const now = new Date().toISOString().slice(0, 10);
      const nowTime = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const defaultImage =
        input.imageUrl ||
        (input.brandId === 'NA_TELE'
          ? 'images/products/natele-skin-tone.svg'
          : 'images/products/borners-core-modal.svg');

      const newConcept: ProductConcept = {
        id,
        code,
        name: input.name,
        brandId: input.brandId,
        collectionName: input.collectionName || 'Разработка R&D',
        stage: input.stage || 'IDEA',
        developmentType: input.developmentType || 'new_construction',
        priority: input.priority || 'Medium',
        tags: input.tags || [],
        nextStep: input.nextStep || 'Назначить ответственного и сформулировать суть идеи для анализа',
        isBlocked: Boolean(input.isBlocked),
        blockReason: input.blockReason || '',
        whatAttracted: input.whatAttracted || input.ideaDescription || '',
        similarInAssortment: input.similarInAssortment || '',
        expectedOutcome: input.expectedOutcome || '',
        referenceLinks: input.referenceLinks || [],
        ideaDescription: input.ideaDescription || '',
        customerProblem: input.customerProblem || '',
        targetAudience: input.targetAudience || '',
        keyDifferentiators: input.keyDifferentiators || '',
        referencesNotes: input.referencesNotes || '',
        imageUrl: defaultImage,
        colorCombinations: input.colorCombinations?.length ? input.colorCombinations : [],
        // На этапе Идеи запрещено подставлять вымышленные коммерческие показатели (п. 4.1, 6, 21 ТЗ)
        plannedRetailPrice: Number(input.plannedRetailPrice ?? 0),
        plannedUnitCost: Number(input.plannedUnitCost ?? 0),
        currency: 'RUB',
        targetLaunchDate: input.targetLaunchDate || '',
        ownerId: input.ownerId || currentUser.id,
        authorId: currentUser.id,
        supplierName: input.supplierName || '',
        sampleStatus: input.sampleStatus || 'Нет данных (этап Идеи)',
        testResults: input.testResults || 'Нет данных',
        developmentBudgetRub: Number(input.developmentBudgetRub ?? 0),
        selectedDesignVersion: 1,
        designVersions: [
          {
            version: 1,
            title: 'Первичный референс v1',
            imageUrl: defaultImage,
            authorName: currentUser.fullName,
            createdAt: now,
            status: 'draft',
            notes: input.ideaDescription || 'Сохранённая идея',
          },
        ],
        samples: input.samples || [],
        testProtocols: input.testProtocols || [],
        approvalDecisions: input.approvalDecisions || [],
        productionOrders: input.productionOrders || [],
        attachments: input.attachments || [],
        stageHistory: [
          {
            id: makeUniqueId('sh'),
            timestamp: nowTime,
            authorName: currentUser.fullName,
            authorRole: currentUser.role,
            actionType: 'created',
            toStage: input.stage || 'IDEA',
            reason: 'Быстрое создание продуктовой идеи в Лаборатории R&D',
          },
        ],
        comments: [],
        techPack: input.techPack || {
          zh: {
            modelName: `${input.name} (${code})`,
            construction: input.keyDifferentiators || '待定 (Определяется)',
            material: '待定 (Определяется)',
            compositionAndDensity: '待定',
            colorAndPantone: (input.colorCombinations || []).join(' / ') || '待定',
            sizeGrading: 'S, M, L, XL, XXL',
            waistbandSpec: '待定',
            seamsSpec: '待定',
            packagingSpec: '待定',
            qualityRequirements: 'AQL 1.5',
            referencesNote: input.referencesNotes || '',
          },
          en: {
            modelName: `${input.name} (${code})`,
            construction: input.keyDifferentiators || 'TBD',
            material: 'TBD',
            compositionAndDensity: 'TBD',
            colorAndPantone: (input.colorCombinations || []).join(' / ') || 'TBD',
            sizeGrading: 'S, M, L, XL, XXL',
            waistbandSpec: 'TBD',
            seamsSpec: 'TBD',
            packagingSpec: 'TBD',
            qualityRequirements: 'AQL 1.5',
            referencesNote: input.referencesNotes || '',
          },
          ru: {
            modelName: `${input.name} (${code})`,
            construction: input.keyDifferentiators || 'Уточняется после анализа',
            material: 'Уточняется на этапе образца',
            compositionAndDensity: 'Нет данных',
            colorAndPantone: (input.colorCombinations || []).join(' / ') || 'Нет данных',
            sizeGrading: 'S, M, L, XL, XXL',
            waistbandSpec: 'Уточняется',
            seamsSpec: 'Плоские швы',
            packagingSpec: 'Уточняется',
            qualityRequirements: 'AQL 1.5',
            referencesNote: input.referencesNotes || '',
          },
        },
        isDemo: false,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      };

      setState((prev) => ({
        ...prev,
        concepts: [newConcept, ...prev.concepts],
        auditLog: [
          appendAudit('concept', id, 'created', `Создана разработка «${newConcept.code} · ${newConcept.name}» в Product Lab R&D`),
          ...prev.auditLog,
        ],
      }));
      setSelectedConceptId(id);
      notify('success', 'Идея сохранена в Лаборатории R&D', `${newConcept.code} · ${newConcept.name}`);
      return newConcept;
    },
    [appendAudit, currentUser, notify, state.concepts.length]
  );

  const updateConcept = useCallback(
    (id: string, patch: Partial<ProductConcept>) => {
      const now = new Date().toISOString().slice(0, 10);
      setState((prev) => {
        const target = prev.concepts.find((c) => c.id === id);
        if (!target) return prev;
        const updatedConcept = { ...target, ...patch, updatedAt: now };

        // Синхронизация со связанным Product, если он уже создан (п. 13 ТЗ: один объект синхронен во всех разделах!)
        const updatedProducts = prev.products.map((p) => {
          if (p.conceptId === id || p.id === updatedConcept.linkedProductId) {
            return {
              ...p,
              name: patch.name ?? p.name,
              imageUrl: patch.imageUrl ?? p.imageUrl,
              colorCombinations: patch.colorCombinations ?? p.colorCombinations,
              economics: {
                ...p.economics,
                plannedRetailPrice: patch.plannedRetailPrice ?? p.economics.plannedRetailPrice,
                unitCostPrice: patch.plannedUnitCost ?? p.economics.unitCostPrice,
              },
              updatedAt: now,
            };
          }
          return p;
        });

        return {
          ...prev,
          concepts: prev.concepts.map((c) => (c.id === id ? updatedConcept : c)),
          products: updatedProducts,
          auditLog: [
            appendAudit('concept', id, 'updated', `Обновлена разработка «${updatedConcept.code} · ${updatedConcept.name}»`),
            ...prev.auditLog,
          ],
        };
      });
    },
    [appendAudit]
  );

  const deleteConcept = useCallback(
    (id: string) => {
      const target = state.concepts.find((c) => c.id === id);
      setState((prev) => ({
        ...prev,
        concepts: prev.concepts.map((c) => (c.id === id ? { ...c, isArchived: true } : c)),
        auditLog: [
          appendAudit('concept', id, 'deleted', `Перемещена в Корзину удалений карточка «${target?.code || id} · ${target?.name || ''}»`),
          ...prev.auditLog,
        ],
      }));
      if (selectedConceptId === id) {
        setSelectedConceptId(null);
      }
      notify(
        'warning',
        `Карточка «${target?.name || id}» перемещена в Корзину`,
        'Вы можете восстановить её в любой момент через «Корзину удалений» в меню.'
      );
    },
    [appendAudit, notify, selectedConceptId, state.concepts]
  );

  const updateConceptStage = useCallback(
    (id: string, stage: ConceptStage, reason?: string) => {
      const nowTime = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const target = state.concepts.find((c) => c.id === id);
      const historyEntry = {
        id: `sh-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        timestamp: nowTime,
        authorName: currentUser.fullName,
        authorRole: currentUser.role,
        actionType: 'stage_change' as const,
        fromStage: target?.stage,
        toStage: stage,
        reason: reason || `Переход на этап «${CONCEPT_STAGE_LABELS_RU[stage]}»`,
      };
      updateConcept(id, {
        stage,
        stageHistory: [historyEntry, ...(target?.stageHistory || [])],
      });
      notify('success', `Этап изменён на «${CONCEPT_STAGE_LABELS_RU[stage]}»`);
    },
    [currentUser.fullName, currentUser.role, notify, state.concepts, updateConcept]
  );

  // 2. Создание Product в каталоге напрямую из Concept (п. 18, 25 ТЗ: без дублирования независимых копий!)
  const createProductFromConcept = useCallback(
    (conceptId: string): Product | null => {
      const concept = state.concepts.find((c) => c.id === conceptId);
      if (!concept) return null;

      if (concept.linkedProductId) {
        const existing = state.products.find((p) => p.id === concept.linkedProductId);
        if (existing) {
          setSelectedProductId(existing.id);
          notify('warning', 'Продукт уже связан с концепцией', `Открыта карточка ${existing.sku}`);
          return existing;
        }
      }

      const now = new Date().toISOString().slice(0, 10);
      const productId = makeUniqueId('prod');
      const sku = concept.code.replace('-LAB-', '-PRD-');

      const newProduct: Product = {
        id: productId,
        sku,
        name: concept.name,
        brandId: concept.brandId,
        conceptId: concept.id,
        category: 'Боксеры',
        productType: 'Лимитированная коллекция',
        collection: concept.collectionName,
        priceSegment: concept.brandId === 'NA_TELE' ? 'Premium' : 'Middle+',
        status: concept.stage === 'APPROVED' || concept.stage === 'PRODUCTION' ? 'approved' : 'in_development',
        description: concept.ideaDescription,
        ownerId: concept.ownerId,
        imageUrl: concept.imageUrl,
        galleryUrls: [concept.imageUrl],
        colorCombinations: concept.colorCombinations,
        materials: concept.techPack.ru.material,
        fabricComposition: concept.techPack.ru.compositionAndDensity,
        fabricDensityGsm: 180,
        waistbandType: concept.techPack.ru.waistbandSpec,
        fitType: 'Анатомическая 3D-посадка',
        constructionDetails: concept.techPack.ru.construction,
        sizes: ['S', 'M', 'L', 'XL', 'XXL'],
        supplierName: concept.supplierName || 'Guangdong Apex Intimate Apparel Co., Ltd.',
        supplierCountry: 'Китай',
        moq: 2000,
        productionLeadDays: 32,
        deliveryLeadDays: 16,
        techFiles: [
          {
            id: makeUniqueId('asset'),
            title: `Техническое задание ${sku} (Китайский/Англ/Рус).pdf`,
            assetType: 'tech_pack',
            url: concept.imageUrl,
            uploadedAt: now,
          },
        ],
        economics: {
          currency: 'RUB',
          plannedRetailPrice: concept.plannedRetailPrice,
          actualRetailPrice: concept.plannedRetailPrice,
          discountPct: 0,
          vatPct: 20,
          returnRatePct: 3.5,
          unitCostPrice: concept.plannedUnitCost,
          marketplaceCommissionRub: Math.round(concept.plannedRetailPrice * 0.19),
          logisticsRub: 95,
          advertisingRub: Math.round(concept.plannedRetailPrice * 0.1),
          otherVariableRub: 30,
        },
        unitsSold: 0,
        revenueRub: 0,
        operatingProfitRub: 0,
        monthlyDynamicsPct: 0,
        salesChannels:
          concept.brandId === 'NA_TELE'
            ? ['Собственный магазин', 'Ozon']
            : ['Wildberries', 'Ozon', 'Собственный магазин'],
        variants: [
          {
            id: makeUniqueId('var'),
            productId,
            variantSku: `${sku}-M`,
            colorName: concept.colorCombinations[0] || 'Чёрный + Тёмно-синий',
            colorHex: concept.brandId === 'NA_TELE' ? '#8B8078' : '#D97745',
            secondaryColorHex: '#171717',
            size: 'M',
            packConfiguration: '1 шт.',
            stockQty: 0,
          },
          {
            id: makeUniqueId('var'),
            productId,
            variantSku: `${sku}-L`,
            colorName: concept.colorCombinations[0] || 'Чёрный + Тёмно-синий',
            colorHex: concept.brandId === 'NA_TELE' ? '#8B8078' : '#D97745',
            secondaryColorHex: '#171717',
            size: 'L',
            packConfiguration: '1 шт.',
            stockQty: 0,
          },
        ],
        isDemo: false,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      };

      setState((prev) => ({
        ...prev,
        products: [newProduct, ...prev.products],
        concepts: prev.concepts.map((c) =>
          c.id === conceptId ? { ...c, linkedProductId: productId, updatedAt: now } : c
        ),
        auditLog: [
          appendAudit(
            'product',
            productId,
            'created_from_concept',
            `Из концепции «${concept.name}» создана карточка продукта ${sku} в каталоге`
          ),
          ...prev.auditLog,
        ],
      }));

      setSelectedProductId(productId);
      notify('success', 'Модель создана в Каталоге продуктов', `Артикул ${sku} связан с концепцией ${concept.code}`);
      return newProduct;
    },
    [state.concepts, state.products, appendAudit, notify]
  );

  const createProduct = useCallback(
    (input: Partial<Product> & { name: string; sku: string; brandId: string }): Product => {
      const now = new Date().toISOString().slice(0, 10);
      const id = makeUniqueId('prod');
      const newProduct: Product = {
        id,
        sku: input.sku,
        name: input.name,
        brandId: input.brandId,
        conceptId: input.conceptId,
        category: input.category || 'Боксеры',
        productType: input.productType || 'Базовая коллекция',
        collection: input.collection || 'Базовая линия 2027',
        priceSegment: input.priceSegment || 'Middle+',
        status: input.status || 'active',
        description: input.description || '',
        ownerId: input.ownerId || currentUser.id,
        imageUrl:
          input.imageUrl ||
          (input.brandId === 'NA_TELE'
            ? 'images/products/natele-milky-black.svg'
            : 'images/products/borners-core-modal.svg'),
        galleryUrls: [
          input.imageUrl ||
            (input.brandId === 'NA_TELE'
              ? 'images/products/natele-milky-black.svg'
              : 'images/products/borners-core-modal.svg'),
        ],
        colorCombinations: input.colorCombinations || ['чёрный + тёмно-синий'],
        materials: input.materials || 'Микромодал + Эластан',
        fabricComposition: input.fabricComposition || '92% модал / 8% эластан',
        fabricDensityGsm: input.fabricDensityGsm || 180,
        waistbandType: input.waistbandType || 'Жаккардовая резинка 38 мм',
        fitType: input.fitType || 'Анатомическая посадка',
        constructionDetails: input.constructionDetails || 'Плоские швы (4 иглы, 6 нитей)',
        sizes: input.sizes || ['S', 'M', 'L', 'XL', 'XXL'],
        supplierName: input.supplierName || 'Guangdong Apex Intimate Apparel Co., Ltd.',
        supplierCountry: input.supplierCountry || 'Китай',
        moq: input.moq || 2000,
        productionLeadDays: input.productionLeadDays || 30,
        deliveryLeadDays: input.deliveryLeadDays || 16,
        techFiles: input.techFiles || [],
        economics: input.economics || {
          currency: 'RUB',
          plannedRetailPrice: 1590,
          actualRetailPrice: 1490,
          discountPct: 0,
          vatPct: 20,
          returnRatePct: 3.5,
          unitCostPrice: 320,
          marketplaceCommissionRub: 280,
          logisticsRub: 85,
          advertisingRub: 140,
          otherVariableRub: 30,
        },
        unitsSold: input.unitsSold || 0,
        revenueRub: input.revenueRub || 0,
        operatingProfitRub: input.operatingProfitRub || 0,
        monthlyDynamicsPct: 0,
        salesChannels: input.salesChannels || ['Wildberries', 'Ozon'],
        variants: input.variants || [],
        isDemo: false,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      };

      setState((prev) => {
        const cleanSku = newProduct.sku.trim().toUpperCase();
        const cleanName = newProduct.name.trim().toUpperCase();
        const existingIdx = prev.products.findIndex(
          (p) =>
            p.brandId === newProduct.brandId &&
            (p.sku.trim().toUpperCase() === cleanSku ||
              p.name.trim().toUpperCase() === cleanName)
        );
        if (existingIdx !== -1) {
          const updatedList = [...prev.products];
          updatedList[existingIdx] = {
            ...updatedList[existingIdx],
            ...input,
            isArchived: false,
            status: input.status || 'active',
            updatedAt: now,
          };
          return {
            ...prev,
            products: deduplicateAndHealProducts(updatedList),
          };
        }
        return {
          ...prev,
          products: deduplicateAndHealProducts([newProduct, ...prev.products]),
          auditLog: [
            appendAudit('product', id, 'created', `Добавлена модель «${newProduct.name}» (${newProduct.sku})`),
            ...prev.auditLog,
          ],
        };
      });
      notify('success', 'Модель добавлена в каталог', `${newProduct.sku} · ${newProduct.name}`);
      return newProduct;
    },
    [appendAudit, currentUser.id, notify]
  );

  const updateProduct = useCallback(
    (id: string, patch: Partial<Product>) => {
      const now = new Date().toISOString().slice(0, 10);
      setState((prev) => {
        const target = prev.products.find((p) => p.id === id);
        if (!target) return prev;
        const updatedProduct = { ...target, ...patch, updatedAt: now };

        // Синхронизация со связанной концепцией и запусками (п. 18, 25 ТЗ)
        const updatedConcepts = prev.concepts.map((c) => {
          if (c.linkedProductId === id || c.id === updatedProduct.conceptId) {
            return {
              ...c,
              name: patch.name ?? c.name,
              imageUrl: patch.imageUrl ?? c.imageUrl,
              colorCombinations: patch.colorCombinations ?? c.colorCombinations,
              plannedRetailPrice:
                patch.economics?.plannedRetailPrice ?? c.plannedRetailPrice,
              plannedUnitCost: patch.economics?.unitCostPrice ?? c.plannedUnitCost,
              updatedAt: now,
            };
          }
          return c;
        });

        return {
          ...prev,
          products: prev.products.map((p) => (p.id === id ? updatedProduct : p)),
          concepts: updatedConcepts,
          auditLog: [
            appendAudit('product', id, 'updated', `Обновлена карточка модели «${updatedProduct.name}»`),
            ...prev.auditLog,
          ],
        };
      });
      notify('success', 'Карточка модели сохранена');
    },
    [appendAudit, notify]
  );

  // Мягкое архивирование без разрушения связей (п. 17, 25 ТЗ: «архивирование не ломает связи»)
  const archiveEntity = useCallback(
    (type: 'product' | 'concept' | 'launch' | 'task' | 'document', id: string) => {
      setState((prev) => {
        const next = { ...prev };
        if (type === 'product') {
          const target = prev.products.find((p) => p.id === id);
          const nextArchiveState = target ? !target.isArchived : true;
          const targetSku = target?.sku?.trim().toUpperCase();
          const targetName = target?.name?.trim().toUpperCase();

          next.products = prev.products.map((p) => {
            const isMatch =
              p.id === id ||
              (nextArchiveState &&
                target &&
                p.brandId === target.brandId &&
                ((targetSku && p.sku.trim().toUpperCase() === targetSku) ||
                  (targetName && p.name.trim().toUpperCase() === targetName)));
            return isMatch
              ? {
                  ...p,
                  isArchived: nextArchiveState,
                  status: nextArchiveState ? 'archived' : 'active',
                }
              : p;
          });
        } else if (type === 'concept') {
          next.concepts = prev.concepts.map((c) =>
            c.id === id ? { ...c, isArchived: !c.isArchived } : c
          );
        } else if (type === 'launch') {
          next.launches = prev.launches.map((l) =>
            l.id === id ? { ...l, isArchived: !l.isArchived } : l
          );
        } else if (type === 'task') {
          next.tasks = prev.tasks.map((t) =>
            t.id === id ? { ...t, isArchived: !t.isArchived } : t
          );
        } else if (type === 'document') {
          next.documents = prev.documents.map((d) =>
            d.id === id ? { ...d, isArchived: !d.isArchived } : d
          );
        }
        next.auditLog = [
          appendAudit(type, id, 'archived', `Изменён статус архивирования объекта (${type}: ${id}) с сохранением всех связей`),
          ...prev.auditLog,
        ];
        return next;
      });
      notify('warning', 'Статус архива обновлён', 'Все связанные объекты и история сохранены.');
    },
    [appendAudit, notify]
  );

  // 3. Создание коммерческого запуска (Launch) с 10 этапами и синхронизацией с продуктом, концепцией и финпланом (п. 10, 18, 25 ТЗ)
  const createLaunch = useCallback(
    (input: {
      name: string;
      brandId: string;
      collectionName: string;
      productId?: string;
      conceptId?: string;
      startDate: string;
      marketingBudgetRub: number;
      salesPlanUnits: number;
      salesPlanRub: number;
      ownerId: string;
    }): Launch => {
      const id = makeUniqueId('launch');
      const now = new Date().toISOString().slice(0, 10);
      const linkedProduct = state.products.find((p) => p.id === input.productId);
      const linkedConcept = state.concepts.find((c) => c.id === input.conceptId);

      // 10 обязательных этапов запуска (п. 10 ТЗ)
      const sDate = input.startDate;
      const stages: Launch['stages'] = [
        { code: 'concept', label: 'Концепция', deadline: shiftDateString(sDate, -75), ownerId: input.ownerId, status: 'Done' },
        { code: 'design', label: 'Дизайн', deadline: shiftDateString(sDate, -60), ownerId: input.ownerId, status: 'Done' },
        { code: 'sample', label: 'Образец', deadline: shiftDateString(sDate, -45), ownerId: 'user-partner', status: 'In Progress' },
        { code: 'testing', label: 'Тест', deadline: shiftDateString(sDate, -35), ownerId: input.ownerId, status: 'Pending' },
        { code: 'production', label: 'Производство', deadline: shiftDateString(sDate, -18), ownerId: 'user-partner', status: 'Pending' },
        { code: 'logistics', label: 'Логистика', deadline: shiftDateString(sDate, -8), ownerId: 'user-admin', status: 'Pending' },
        { code: 'cards', label: 'Карточки', deadline: shiftDateString(sDate, -5), ownerId: input.ownerId, status: 'Pending' },
        { code: 'marketing', label: 'Маркетинг', deadline: shiftDateString(sDate, -2), ownerId: input.ownerId, status: 'Pending' },
        { code: 'sales', label: 'Продажи', deadline: sDate, ownerId: input.ownerId, status: 'Pending' },
        { code: 'analysis', label: 'Анализ', deadline: shiftDateString(sDate, 21), ownerId: 'user-viewer', status: 'Pending' },
      ];

      const newLaunch: Launch = {
        id,
        name: input.name,
        brandId: input.brandId,
        collectionName: input.collectionName || 'Выпуск 2027',
        productIds: input.productId ? [input.productId] : [],
        conceptId: input.conceptId || linkedProduct?.conceptId,
        startDate: input.startDate,
        readinessPct: 35,
        productionStatus: 'Запуск сформирован, подготовка партии',
        marketingBudgetRub: Number(input.marketingBudgetRub || 0),
        salesPlanUnits: Number(input.salesPlanUnits || 0),
        salesPlanRub: Number(input.salesPlanRub || 0),
        ownerId: input.ownerId || currentUser.id,
        status: 'В работе',
        imageUrl:
          linkedProduct?.imageUrl ||
          linkedConcept?.imageUrl ||
          (input.brandId === 'NA_TELE'
            ? 'images/products/natele-skin-tone.svg'
            : 'images/products/borners-big-love.svg'),
        stages,
        isDemo: false,
        isArchived: false,
        updatedAt: now,
      };

      setState((prev) => ({
        ...prev,
        launches: [newLaunch, ...prev.launches],
        concepts: prev.concepts.map((c) =>
          c.id === newLaunch.conceptId || (input.productId && c.linkedProductId === input.productId)
            ? { ...c, linkedLaunchId: id, targetLaunchDate: input.startDate }
            : c
        ),
        auditLog: [
          appendAudit('launch', id, 'created', `Создан запуск «${newLaunch.name}» на дату ${newLaunch.startDate}`),
          ...prev.auditLog,
        ],
      }));

      setSelectedLaunchId(id);
      notify('success', 'Запуск добавлен в Календарь запусков и на Дашборд', `${newLaunch.name} · ${newLaunch.startDate}`);
      return newLaunch;
    },
    [state.products, state.concepts, currentUser.id, appendAudit, notify]
  );

  const updateLaunch = useCallback(
    (id: string, patch: Partial<Launch>) => {
      const now = new Date().toISOString().slice(0, 10);
      setState((prev) => ({
        ...prev,
        launches: prev.launches.map((l) => (l.id === id ? { ...l, ...patch, updatedAt: now } : l)),
        auditLog: [
          appendAudit('launch', id, 'updated', `Обновлён запуск (${Object.keys(patch).join(', ')})`),
          ...prev.auditLog,
        ],
      }));
      notify('success', 'Параметры запуска сохранены');
    },
    [appendAudit, notify]
  );

  // Перенос даты запуска с явным выбором: сдвигать или НЕ сдвигать зависимые дедлайны этапов и задач (п. 10 ТЗ)
  const rescheduleLaunch = useCallback(
    (launchId: string, newStartDate: string, shiftDependentDates: boolean) => {
      const now = new Date().toISOString().slice(0, 10);
      setState((prev) => {
        const launch = prev.launches.find((l) => l.id === launchId);
        if (!launch) return prev;
        const deltaDays = Math.round(
          (new Date(newStartDate).getTime() - new Date(launch.startDate).getTime()) /
            (1000 * 60 * 60 * 24)
        );

        const nextStages = shiftDependentDates
          ? launch.stages.map((st) => ({
              ...st,
              deadline: shiftDateString(st.deadline, deltaDays),
            }))
          : launch.stages;

        const nextTasks = shiftDependentDates
          ? prev.tasks.map((t) =>
              t.launchId === launchId && t.status !== 'Done'
                ? { ...t, deadline: shiftDateString(t.deadline, deltaDays) }
                : t
            )
          : prev.tasks;

        return {
          ...prev,
          launches: prev.launches.map((l) =>
            l.id === launchId
              ? { ...l, startDate: newStartDate, stages: nextStages, updatedAt: now }
              : l
          ),
          tasks: nextTasks,
          auditLog: [
            appendAudit(
              'launch',
              launchId,
              'rescheduled',
              `Дата запуска «${launch.name}» перенесена на ${newStartDate} (${
                shiftDependentDates ? 'зависимые сроки сдвинуты' : 'зависимые сроки оставлены без изменений'
              })`
            ),
            ...prev.auditLog,
          ],
        };
      });

      notify(
        'success',
        `Дата запуска перенесена на ${newStartDate}`,
        shiftDependentDates
          ? 'Дедлайны этапов и связанных задач синхронно сдвинуты по вашему подтверждению.'
          : 'Зависимые даты этапов и задач сохранены без изменений.'
      );
    },
    [appendAudit, notify]
  );

  const createTask = useCallback(
    (input: {
      title: string;
      description?: string;
      brandId: string;
      projectId?: string;
      productId?: string;
      conceptId?: string;
      launchId?: string;
      assigneeId: string;
      priority: TaskItem['priority'];
      deadline: string;
    }): TaskItem => {
      const id = makeUniqueId('task');
      const newTask: TaskItem = {
        id,
        title: input.title,
        description: input.description || '',
        brandId: input.brandId,
        projectId: input.projectId || state.projects[0]?.id || 'proj-big-love',
        productId: input.productId,
        conceptId: input.conceptId,
        launchId: input.launchId,
        assigneeId: input.assigneeId || currentUser.id,
        priority: input.priority || 'High',
        deadline: input.deadline || '2027-01-20',
        status: 'To Do',
        comments: [],
        attachments: [],
        isDemo: false,
        isArchived: false,
      };

      setState((prev) => ({
        ...prev,
        tasks: [newTask, ...prev.tasks],
        auditLog: [
          appendAudit('task', id, 'created', `Создана задача «${newTask.title}»`),
          ...prev.auditLog,
        ],
      }));
      notify('success', 'Задача создана и назначена ответственному', newTask.title);
      return newTask;
    },
    [state.projects, currentUser.id, appendAudit, notify]
  );

  const updateTask = useCallback(
    (id: string, patch: Partial<TaskItem>) => {
      setState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      }));
      notify('success', 'Задача обновлена');
    },
    [notify]
  );

  const updateTaskStatus = useCallback(
    (id: string, status: TaskStatus) => {
      setState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
        auditLog: [
          appendAudit('task', id, 'status_changed', `Статус задачи изменён на «${TASK_STATUS_LABELS_RU[status]}»`),
          ...prev.auditLog,
        ],
      }));
      notify('success', `Статус задачи: ${TASK_STATUS_LABELS_RU[status]}`);
    },
    [appendAudit, notify]
  );

  const updateStrategyBlock = useCallback(
    (id: string, patch: Partial<StrategyBlock>, comment?: string) => {
      const now = new Date().toISOString().slice(0, 10);
      setState((prev) => {
        const block = prev.strategies.find((s) => s.id === id);
        if (!block) return prev;
        const nextVersion = block.version + 1;
        const nextStatus = patch.status ?? block.status;
        const historyEntry = {
          version: nextVersion,
          authorName: `${currentUser.fullName} (${ROLE_LABELS_RU[currentUser.role]})`,
          updatedAt: now,
          status: nextStatus,
          comment: comment || 'Обновление стратегического блока',
        };
        return {
          ...prev,
          strategies: prev.strategies.map((s) =>
            s.id === id
              ? {
                  ...s,
                  ...patch,
                  version: nextVersion,
                  authorName: `${currentUser.fullName} (${ROLE_LABELS_RU[currentUser.role]})`,
                  updatedAt: now,
                  history: [historyEntry, ...s.history],
                }
              : s
          ),
          auditLog: [
            appendAudit('strategy', id, 'updated', `Обновлён блок стратегии «${block.titleRu}» (v${nextVersion})`),
            ...prev.auditLog,
          ],
        };
      });
      notify('success', 'Стратегический блок сохранён в истории версий');
    },
    [currentUser, appendAudit, notify]
  );

  const updateFinancialPlanRow = useCallback(
    (id: string, patch: Partial<FinancialPlanRow>) => {
      const now = new Date().toISOString().slice(0, 10);
      setState((prev) => ({
        ...prev,
        financialPlans: prev.financialPlans.map((r) =>
          r.id === id
            ? { ...r, ...patch, updatedAt: now, updatedBy: currentUser.fullName }
            : r
        ),
        auditLog: [
          appendAudit('finance', id, 'updated', `Обновлена строка финансового плана (${id})`),
          ...prev.auditLog,
        ],
      }));
      notify('success', 'Финансовые показатели обновлены');
    },
    [currentUser.fullName, appendAudit, notify]
  );

  const addFinancialPlanRow = useCallback(
    (row: Omit<FinancialPlanRow, 'id' | 'updatedAt' | 'updatedBy'>) => {
      const id = `fin-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const now = new Date().toISOString().slice(0, 10);
      setState((prev) => ({
        ...prev,
        financialPlans: [
          ...prev.financialPlans,
          {
            ...row,
            id,
            updatedAt: now,
            updatedBy: currentUser.fullName,
          },
        ],
      }));
    },
    [currentUser.fullName]
  );

  const createCampaign = useCallback(
    (input: Omit<Campaign, 'id' | 'isDemo' | 'isArchived'>) => {
      const id = makeUniqueId('camp');
      setState((prev) => ({
        ...prev,
        campaigns: [{ ...input, id, isDemo: false, isArchived: false }, ...prev.campaigns],
      }));
      notify('success', 'Маркетинговая кампания создана', input.name);
    },
    [notify]
  );

  const createExperiment = useCallback(
    (input: Omit<GrowthExperiment, 'id' | 'isDemo'>) => {
      const id = makeUniqueId('exp');
      setState((prev) => ({
        ...prev,
        experiments: [{ ...input, id, isDemo: false }, ...prev.experiments],
      }));
      notify('success', 'Эксперимент роста запущен', input.hypothesis);
    },
    [notify]
  );

  const updateCampaign = useCallback(
    (id: string, patch: Partial<Campaign>) => {
      setState((prev) => ({
        ...prev,
        campaigns: prev.campaigns.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }));
      notify('success', 'Метрики маркетинговой кампании обновлены');
    },
    [notify]
  );

  const updateExperiment = useCallback(
    (id: string, patch: Partial<GrowthExperiment>) => {
      setState((prev) => ({
        ...prev,
        experiments: prev.experiments.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      }));
      notify('success', 'Статус и результаты гипотезы обновлены');
    },
    [notify]
  );

  const createCompetitor = useCallback(
    (input: Omit<Competitor, 'id' | 'isDemo'>) => {
      const id = `comp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      setState((prev) => ({
        ...prev,
        competitors: [{ ...input, id, isDemo: false }, ...prev.competitors],
      }));
      notify('success', 'Конкурент добавлен в базу Аналитики рынка', input.brandName);
    },
    [notify]
  );

  const createResearch = useCallback(
    (input: Omit<ResearchItem, 'id' | 'isDemo'>) => {
      const id = makeUniqueId('res');
      setState((prev) => ({
        ...prev,
        research: [{ ...input, id, isDemo: false }, ...prev.research],
      }));
      notify('success', 'Исследование сохранено в библиотеке исследований', input.title);
    },
    [notify]
  );

  const createDocument = useCallback(
    (input: Omit<DocumentItem, 'id' | 'uploadedAt' | 'uploadedBy' | 'isArchived'>) => {
      const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const now = new Date().toISOString().slice(0, 10);
      setState((prev) => ({
        ...prev,
        documents: [
          {
            ...input,
            id,
            uploadedAt: now,
            uploadedBy: currentUser.fullName,
            isArchived: false,
          },
          ...prev.documents,
        ],
        auditLog: [
          appendAudit('document', id, 'created', `Загружен документ «${input.title}» (${input.fileName})`),
          ...prev.auditLog,
        ],
      }));
      notify('success', 'Файл проверен и загружен в хранилище', input.fileName);
    },
    [currentUser.fullName, appendAudit, notify]
  );

  const updateDocument = useCallback(
    (id: string, patch: Partial<DocumentItem>) => {
      setState((prev) => ({
        ...prev,
        documents: prev.documents.map((d) => (d.id === id ? { ...d, ...patch } : d)),
      }));
      notify('success', 'Привязка и параметры документа обновлены');
    },
    [notify]
  );

  const restoreEntity = useCallback(
    (type: 'product' | 'concept' | 'launch' | 'task' | 'document', id: string) => {
      setState((prev) => {
        const next = { ...prev };
        if (type === 'product') {
          next.products = prev.products.map((p) =>
            p.id === id ? { ...p, isArchived: false, status: 'active' } : p
          );
        } else if (type === 'concept') {
          next.concepts = prev.concepts.map((c) =>
            c.id === id ? { ...c, isArchived: false } : c
          );
        } else if (type === 'launch') {
          next.launches = prev.launches.map((l) =>
            l.id === id ? { ...l, isArchived: false } : l
          );
        } else if (type === 'task') {
          next.tasks = prev.tasks.map((t) =>
            t.id === id ? { ...t, isArchived: false } : t
          );
        } else if (type === 'document') {
          next.documents = prev.documents.map((d) =>
            d.id === id ? { ...d, isArchived: false } : d
          );
        }
        next.auditLog = [
          appendAudit(type, id, 'restored', `Восстановлен объект из Корзины удалений (${type}: ${id})`),
          ...prev.auditLog,
        ];
        return next;
      });
      notify('success', 'Объект восстановлен из Корзины удалений');
    },
    [appendAudit, notify]
  );

  const permanentlyDeleteEntity = useCallback(
    (type: 'product' | 'concept' | 'launch' | 'task' | 'document', id: string) => {
      setState((prev) => {
        const next = { ...prev };
        if (type === 'product') {
          next.products = prev.products.filter((p) => p.id !== id);
        } else if (type === 'concept') {
          next.concepts = prev.concepts.filter((c) => c.id !== id);
        } else if (type === 'launch') {
          next.launches = prev.launches.filter((l) => l.id !== id);
        } else if (type === 'task') {
          next.tasks = prev.tasks.filter((t) => t.id !== id);
        } else if (type === 'document') {
          next.documents = prev.documents.filter((d) => d.id !== id);
        }
        return next;
      });
      notify('warning', 'Объект удалён из корзины навсегда');
    },
    [notify]
  );

  const emptyTrash = useCallback(() => {
    setState((prev) => ({
      ...prev,
      products: prev.products.filter((p) => !p.isArchived),
      concepts: prev.concepts.filter((c) => !c.isArchived),
      launches: prev.launches.filter((l) => !l.isArchived),
      tasks: prev.tasks.filter((t) => !t.isArchived),
      documents: prev.documents.filter((d) => !d.isArchived),
    }));
    notify('warning', 'Корзина удалений полностью очищена');
  }, [notify]);

  const createMiroItem = useCallback(
    (input: Omit<MiroBoardItem, 'id' | 'createdAt' | 'authorName'>): MiroBoardItem => {
      const id = `miro-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const now = new Date().toISOString().slice(0, 10);
      const item: MiroBoardItem = {
        ...input,
        id,
        authorName: currentUser.fullName,
        createdAt: now,
      };
      setState((prev) => ({
        ...prev,
        miroItems: [...(prev.miroItems || []), item],
      }));
      return item;
    },
    [currentUser.fullName]
  );

  const updateMiroItem = useCallback((id: string, patch: Partial<MiroBoardItem>) => {
    setState((prev) => ({
      ...prev,
      miroItems: (prev.miroItems || []).map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  }, []);

  const deleteMiroItem = useCallback(
    (id: string) => {
      setState((prev) => ({
        ...prev,
        miroItems: (prev.miroItems || [])
          .filter((m) => m.id !== id)
          .map((m) => ({
            ...m,
            connectedToIds: (m.connectedToIds || []).filter((targetId) => targetId !== id),
          })),
      }));
      notify('warning', 'Элемент удалён из Студии идей');
    },
    [notify]
  );

  const updatePresentationOverride = useCallback((key: string, value: string) => {
    setState((prev) => ({
      ...prev,
      presentationOverrides: {
        ...(prev.presentationOverrides || {}),
        [key]: value,
      },
    }));
  }, []);

  const resetPresentationOverrides = useCallback(() => {
    setState((prev) => ({
      ...prev,
      presentationOverrides: {},
    }));
    notify('success', 'Тексты и цифры презентации возвращены к базовым');
  }, [notify]);

  const updateBrandPalette = useCallback(
    (brandId: string, accentColor: string, secondaryColor: string) => {
      const now = new Date().toISOString().slice(0, 10);
      setState((prev) => ({
        ...prev,
        brands: prev.brands.map((b) =>
          b.id === brandId ? { ...b, accentColor, secondaryColor, updatedAt: now } : b
        ),
        auditLog: [
          appendAudit('brand', brandId, 'updated', `Обновлена цветовая палитра бренда ${brandId} (${accentColor})`),
          ...prev.auditLog,
        ],
      }));
      notify('success', `Палитра бренда ${brandId} обновлена`);
    },
    [appendAudit, notify]
  );

  const updateBrand = useCallback(
    (brandId: string, patch: Partial<Brand>) => {
      const now = new Date().toISOString().slice(0, 10);
      setState((prev) => ({
        ...prev,
        brands: prev.brands.map((b) =>
          b.id === brandId || b.code === brandId
            ? { ...b, ...patch, updatedAt: now }
            : b
        ),
      }));
    },
    []
  );

  const createBrand = useCallback(
    (input: { code: string; name: string; tagline: string; segment: string; accentColor: string }) => {
      const code = input.code.toUpperCase().replace(/\s+/g, '_');
      const now = new Date().toISOString().slice(0, 10);
      const newBrand: Brand = {
        id: code,
        code,
        name: input.name,
        tagline: input.tagline,
        segment: input.segment,
        description: input.tagline,
        accentColor: input.accentColor || '#2563EB',
        secondaryColor: '#111111',
        heroImage: 'images/products/borners-core-modal.svg',
        targetMarginPct: 50,
        activeModelsCount: 0,
        upcomingLaunchesCount: 0,
        plannedRevenue2027Rub: 25_000_000,
        actualRevenueYtdRub: 0,
        isDemo: false,
        updatedAt: now,
      };
      setState((prev) => ({
        ...prev,
        brands: [...prev.brands, newBrand],
        auditLog: [
          appendAudit('brand', code, 'created', `Добавлен новый бренд в портфель: ${input.name}`),
          ...prev.auditLog,
        ],
      }));
      notify('success', `Бренд «${input.name}» добавлен в портфель BORNERS GROUP`);
    },
    [appendAudit, notify]
  );

  const resetToDemoDefaults = useCallback(() => {
    setState(DEFAULT_STATE);
    window.localStorage.removeItem(STORAGE_KEY);
    notify('success', 'Демо-данные восстановлены по умолчанию');
  }, [notify]);

  const value = useMemo<PlatformContextValue>(
    () => ({
      ...state,
      isAuthenticated,
      currentUser,
      loginAs,
      logout,
      updateUserRoleOrPermissions,
      activeSection,
      navHistory,
      canGoBack,
      canGoForward,
      navigateTo,
      pushScenarioStep,
      goBack,
      goForward,
      brandFilter,
      setBrandFilter,
      periodFilter,
      setPeriodFilter,
      platformMode,
      setPlatformMode,
      simpleMode,
      setSimpleMode,
      financialScenario,
      setFinancialScenario,
      darkMode,
      setDarkMode,
      selectedProductId,
      setSelectedProductId,
      selectedConceptId,
      setSelectedConceptId,
      selectedLaunchId,
      setSelectedLaunchId,
      toasts,
      notify,
      dismissToast,
      createConcept,
      updateConcept,
      updateConceptStage,
      deleteConcept,
      createProductFromConcept,
      createProduct,
      updateProduct,
      archiveEntity,
      createLaunch,
      updateLaunch,
      rescheduleLaunch,
      createTask,
      updateTask,
      updateTaskStatus,
      updateStrategyBlock,
      updateFinancialPlanRow,
      addFinancialPlanRow,
      createCampaign,
      updateCampaign,
      createExperiment,
      updateExperiment,
      createCompetitor,
      createResearch,
      createDocument,
      updateDocument,
      restoreEntity,
      permanentlyDeleteEntity,
      emptyTrash,
      createMiroItem,
      updateMiroItem,
      deleteMiroItem,
      updatePresentationOverride,
      resetPresentationOverrides,
      updateBrandPalette,
      updateBrand,
      createBrand,
      resetToDemoDefaults,
    }),
    [
      state,
      isAuthenticated,
      currentUser,
      loginAs,
      logout,
      updateUserRoleOrPermissions,
      activeSection,
      navHistory,
      canGoBack,
      canGoForward,
      navigateTo,
      pushScenarioStep,
      goBack,
      goForward,
      brandFilter,
      periodFilter,
      platformMode,
      simpleMode,
      financialScenario,
      darkMode,
      selectedProductId,
      selectedConceptId,
      selectedLaunchId,
      toasts,
      notify,
      dismissToast,
      createConcept,
      updateConcept,
      updateConceptStage,
      deleteConcept,
      createProductFromConcept,
      createProduct,
      updateProduct,
      archiveEntity,
      createLaunch,
      updateLaunch,
      rescheduleLaunch,
      createTask,
      updateTask,
      updateTaskStatus,
      updateStrategyBlock,
      updateFinancialPlanRow,
      addFinancialPlanRow,
      createCampaign,
      updateCampaign,
      createExperiment,
      updateExperiment,
      createCompetitor,
      createResearch,
      createDocument,
      updateDocument,
      restoreEntity,
      permanentlyDeleteEntity,
      emptyTrash,
      createMiroItem,
      updateMiroItem,
      deleteMiroItem,
      updatePresentationOverride,
      resetPresentationOverrides,
      updateBrandPalette,
      updateBrand,
      createBrand,
      resetToDemoDefaults,
    ]
  );

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform() {
  const ctx = useContext(PlatformContext);
  if (!ctx) {
    throw new Error('usePlatform must be used within a PlatformProvider');
  }
  return ctx;
}
