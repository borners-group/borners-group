// =============================================================================
// BORNERS GROUP — STRATEGY & PRODUCT DEVELOPMENT PLATFORM
// Типы данных платформы (п. 14, 15, 17, 18 ТЗ)
// =============================================================================

export type UserRole = 'Owner' | 'Admin' | 'Manager' | 'Viewer' | 'Partner';

export type BrandFilter = 'ALL' | string; // 'ALL' или id/code бренда ('BORNERS', 'NA_TELE', ...)

export type PlatformMode = 'management' | 'strategy';

export type NavSectionId =
  | 'dashboard'
  | 'brand-portfolio'
  | 'brand-strategy'
  | 'market-intelligence'
  | 'product-catalog'
  | 'product-lab'
  | 'marketing-growth'
  | 'launch-calendar'
  | 'finance'
  | 'roadmap-tasks'
  | 'documents'
  | 'team'
  | 'settings';

export type PeriodFilter = '2026' | '2027' | 'Q1 2027' | 'Q2 2027' | 'ALL';

export type ApprovalStatus = 'draft' | 'in_review' | 'approved';

export type ConceptStage =
  | 'IDEA'
  | 'ANALYSIS'
  | 'SAMPLE'
  | 'TEST'
  | 'DECISION'
  | 'PRODUCTION'
  | 'LAUNCH'
  | 'POSTPONED'
  | 'RESEARCH'
  | 'DESIGN'
  | 'PROTOTYPE'
  | 'TESTING'
  | 'APPROVED'
  | 'READY TO LAUNCH'
  | 'ON HOLD'
  | 'REJECTED'
  | 'CANCELLED';

export type RnDDevelopmentType =
  | 'new_construction'
  | 'model_improvement'
  | 'new_variant'
  | 'seasonal_capsule'
  | 'other';

export interface RnDMarketEvidence {
  id: string;
  competitorBrand: string;
  articleSku: string;
  productTitle: string;
  url?: string;
  priceRub: number;
  packQty: string;
  estimatedRevenueRub: number;
  observationPeriod: string;
  sourceName: string;
  confidenceStatus: 'estimated' | 'verified';
  screenshotUrl?: string;
  comparisonNote: string;
}

export interface RnDAnalysisReport {
  // 7.1 Продуктовая гипотеза
  whatWeCreate: string;
  targetBuyer: string;
  concreteAdvantage: string;
  whyChooseUs: string;
  demandType: 'incremental' | 'cannibalization_risk';
  // 7.2 Анализ рынка
  marketEvidences: RnDMarketEvidence[];
  nicheConclusion: string;
  // 7.3 Покупательский спрос и отзывы
  buyerMotives: string;
  competitorProsAndComplaints: string;
  priceBenchmarksAndObjections: string;
  // 7.4 Производственная возможность
  potentialFactories: string;
  materialsAndMoq: string;
  estimatedProductionCostNote: string;
  estimatedLogisticsNote: string;
  estimatedLandedCostNote: string;
  productionRisks: string;
  // 7.5 Заключение анализа
  summaryAndPros: string;
  openQuestionsAndRisks: string;
  confidenceLevel: 'low' | 'medium' | 'high';
  whatToVerifyOnSample: string;
  recommendation: 'continue' | 'supplement' | 'postpone' | 'reject';
}

export interface RnDSampleItem {
  id: string;
  versionCode: string; // напр. "Образец №1", "Образец №2"
  factoryName: string; // напр. "Узбекистан, фабрика C — №1"
  country: string;
  orderedAt: string;
  receivedAt: string;
  status: 'ordered' | 'in_transit' | 'received' | 'testing' | 'approved' | 'rework' | 'rejected';
  photos: string[];
  materialAndComposition: string;
  densityGsm: number;
  sizeTested: string;
  color: string;
  measurementsNote: string;
  sampleCostRub: number;
  estimatedUnitProductionPrice: number;
  currency: 'RUB' | 'USD' | 'CNY';
  preliminaryScore: number; // 1–5
  comments: string;
  isSelectedForProduction: boolean;
  compositionRows?: { material: string; pct: number }[];
  deliveryCostRub?: number;
}

export interface RnDTestCriterionScore {
  criterionKey:
    | 'fit_movement'
    | 'support_anatomy'
    | 'waistband_rideup'
    | 'seams_tactile'
    | 'breathability'
    | 'wash_shape_retention'
    | 'sewing_sizing'
    | 'visual_appeal';
  label: string;
  isRequired: boolean;
  score: number; // 1–5
  result: 'passed' | 'rework' | 'failed';
  comment: string;
}

export interface RnDSampleTestProtocol {
  id: string;
  sampleId: string;
  sampleVersionLabel: string;
  testerName: string;
  testDate: string;
  washCyclesCount: number;
  washTempAndMode: string;
  measurementsBeforeAfter: string;
  criteria: RnDTestCriterionScore[];
  verdict: 'passed' | 'passed_with_remarks' | 'rework_required' | 'failed';
  summaryComment: string;
  evidencePhotos?: string[];
}

export type RnDDecisionOutcome = 'approve' | 'rework' | 'postpone' | 'reject';

export interface RnDApprovalDecision {
  id: string;
  decision: RnDDecisionOutcome;
  authorName: string;
  authorRole: UserRole;
  decidedAt: string;
  approvedSampleId?: string;
  approvedSampleLabel?: string;
  justification: string;
  conditions: string;
}

export type RnDProductionInternalStatus =
  | 'order_prep'
  | 'order_placed'
  | 'in_production'
  | 'qc_inspection'
  | 'ready'
  | 'in_delivery'
  | 'received';

export interface RnDProductionOrder {
  id: string;
  orderNumber: string;
  factoryName: string;
  contactPerson: string;
  approvedSampleVersion: string;
  internalStatus: RnDProductionInternalStatus;
  materialAndColors: string;
  sizeBreakdown: Record<'S' | 'M' | 'L' | 'XL' | 'XXL', number>;
  totalUnits: number;
  packConfiguration: string;
  packagingDetails: string;
  unitPrice: number;
  currency: 'RUB' | 'USD' | 'CNY';
  plannedReadyDate: string;
  actualReadyDate?: string;
  qcNotes: string;
  logisticsTracking: string;
  hasDelayRisk?: boolean;
  packColorComposition?: string;
  unitsPerPack?: number;
  packsBySize?: Record<'S' | 'M' | 'L' | 'XL' | '2XL' | '3XL' | '4XL', number>;
  paymentTerms?: string;
  orderVersion?: number;
  approvedAt?: string;
  chineseVerified?: boolean;
}

export interface RnDLaunchChecklist {
  catalogCreated: boolean;
  photosApproved: boolean;
  descriptionsReady: boolean;
  bundlesAndPricesConfirmed: boolean;
  marketplaceCardsReady: boolean;
  warehouseDistributed: boolean;
  adsPrepared: boolean;
  salesDateAndOwnerAssigned: boolean;
}

export interface RnDPostLaunchCheckpoint {
  day: 7 | 14 | 28;
  ordersRub: number | null;
  ordersUnits: number | null;
  buyoutsRub: number | null;
  buyoutsUnits: number | null;
  avgActualPriceRub: number | null;
  adSpendRub: number | null;
  stockLeftUnits: number | null;
  reviewsSummary: string;
  comparisonWithExpectations: string;
  dataSource: string;
}

export type RnDLaunchOutcome =
  | 'scale'
  | 'optimize'
  | 'repeat_test'
  | 'stop_purchases'
  | 'pending';

export type RnDAttachmentCategory =
  | 'reference'
  | 'sample_media'
  | 'analytics_reviews'
  | 'tech_spec'
  | 'production_docs'
  | 'launch_materials';

export interface RnDAttachmentItem {
  id: string;
  title: string;
  category: RnDAttachmentCategory;
  stage: ConceptStage;
  fileType: string;
  fileSizeLabel: string;
  url: string;
  authorName: string;
  uploadedAt: string;
  isDecisionEvidence?: boolean;
}

export interface RnDStageHistoryEntry {
  id: string;
  timestamp: string;
  authorName: string;
  authorRole: UserRole;
  actionType:
    | 'created'
    | 'stage_change'
    | 'rollback'
    | 'sample_added'
    | 'test_completed'
    | 'decision'
    | 'production_order'
    | 'exception_override';
  fromStage?: string;
  toStage?: string;
  reason: string;
}

export type ProductStatus =
  | 'in_development'
  | 'sampled'
  | 'approved'
  | 'in_production'
  | 'active'
  | 'out_of_stock'
  | 'archived';

export type TaskStatus = 'To Do' | 'In Progress' | 'Review' | 'Done' | 'Blocked';
export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export type FinancialScenario = 'Conservative' | 'Base' | 'Optimistic';
export type ExperimentStatus = 'Planned' | 'Running' | 'Completed' | 'Successful' | 'Unsuccessful';

export interface AppUser {
  id: string;
  email: string;
  fullName: string;
  jobTitle: string;
  role: UserRole;
  canViewFinance: boolean;
  canViewCostPrice: boolean;
  assignedBrandIds: string[]; // пустой массив или все id для Owner/Admin
  avatarInitials: string;
  isActive: boolean;
}

export interface Brand {
  id: string;
  code: string; // 'BORNERS' | 'NA_TELE' | 'AKUSHA' | 'LISKANI' | новые бренды
  name: string;
  tagline: string;
  segment: string;
  description: string;
  accentColor: string;
  secondaryColor: string;
  heroImage: string;
  targetMarginPct: number;
  activeModelsCount: number;
  upcomingLaunchesCount: number;
  plannedRevenue2027Rub: number;
  actualRevenueYtdRub: number;
  isStrategyInDevelopment?: boolean;
  statusNote?: string;
  isDemo: boolean;
  isArchived?: boolean;
  updatedAt: string;
}

export interface StrategyVersionEntry {
  version: number;
  authorName: string;
  updatedAt: string;
  status: ApprovalStatus;
  comment: string;
}

export interface StrategyBlock {
  id: string;
  brandId: string;
  sectionKey: string;
  sectionOrder: number;
  titleEn: string;
  titleRu: string;
  summary: string;
  content: string;
  draftContent?: string;
  kpiHighlights: { label: string; value: string }[];
  status: ApprovalStatus;
  deadline?: string;
  version: number;
  authorName: string;
  updatedAt: string;
  history: StrategyVersionEntry[];
  isDemo: boolean;
}

export interface ProductVariant {
  id: string;
  productId: string;
  variantSku: string;
  colorName: string;
  colorHex: string;
  secondaryColorHex?: string;
  size: 'S' | 'M' | 'L' | 'XL' | 'XXL';
  packConfiguration: string;
  stockQty: number;
}

export interface ProductEconomics {
  currency: 'RUB' | 'USD' | 'CNY';
  plannedRetailPrice: number;
  actualRetailPrice: number;
  discountPct: number;
  vatPct: number;
  returnRatePct: number;
  unitCostPrice: number; // себестоимость (ограничено правом canViewCostPrice)
  marketplaceCommissionRub: number;
  logisticsRub: number;
  advertisingRub: number;
  otherVariableRub: number;
}

export interface ProductAsset {
  id: string;
  title: string;
  assetType: 'photo' | 'render' | 'tech_pack' | 'certificate';
  url: string;
  uploadedAt: string;
}

export interface Product {
  id: string; // UUID
  sku: string;
  name: string;
  brandId: string;
  conceptId?: string;
  category: 'Боксеры' | 'Транки' | 'Брифы' | 'Мультипак' | 'Лимитированная капсула' | string;
  productType: 'Базовая коллекция' | 'Лимитированная коллекция' | 'Капсула оттенков кожи' | 'Мультипак' | string;
  collection: string;
  priceSegment: 'Mass-Market+' | 'Middle+' | 'Premium';
  status: ProductStatus;
  description: string;
  ownerId: string;
  // Дизайн
  imageUrl: string;
  galleryUrls: string[];
  colorCombinations: string[];
  materials: string;
  fabricComposition: string;
  fabricDensityGsm: number;
  waistbandType: string;
  fitType: string;
  constructionDetails: string;
  sizes: string[];
  // Производство
  supplierName: string;
  supplierCountry: string;
  moq: number;
  productionLeadDays: number;
  deliveryLeadDays: number;
  techFiles: ProductAsset[];
  // Экономика
  economics: ProductEconomics;
  // Продажи
  unitsSold: number;
  revenueRub: number;
  operatingProfitRub: number;
  monthlyDynamicsPct: number;
  salesChannels: string[];
  // Варианты
  variants: ProductVariant[];
  isDemo: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TechPackTranslation {
  modelName: string;
  construction: string;
  material: string;
  compositionAndDensity: string;
  colorAndPantone: string;
  sizeGrading: string;
  waistbandSpec: string;
  seamsSpec: string;
  packagingSpec: string;
  qualityRequirements: string;
  referencesNote: string;
}

export interface DesignVersion {
  version: number;
  title: string;
  imageUrl: string;
  authorName: string;
  createdAt: string;
  status: ApprovalStatus;
  notes: string;
}

export interface ConceptComment {
  id: string;
  authorName: string;
  authorRole: UserRole;
  text: string;
  createdAt: string;
}

export interface ProductConcept {
  id: string;
  code: string;
  name: string;
  brandId: string;
  collectionName: string;
  stage: ConceptStage;
  developmentType?: RnDDevelopmentType;
  priority?: TaskPriority;
  tags?: string[];
  nextStep?: string;
  isBlocked?: boolean;
  blockReason?: string;
  whatAttracted?: string;
  similarInAssortment?: string;
  expectedOutcome?: string;
  referenceLinks?: string[];
  ideaDescription: string;
  customerProblem: string;
  targetAudience: string;
  keyDifferentiators: string;
  referencesNotes: string;
  imageUrl: string;
  colorCombinations: string[];
  plannedRetailPrice: number;
  plannedUnitCost: number;
  currency: 'RUB' | 'USD' | 'CNY';
  targetLaunchDate: string;
  ownerId: string;
  authorId?: string;
  supplierName: string;
  sampleStatus: string;
  testResults: string;
  developmentBudgetRub: number;
  selectedDesignVersion: number;
  designVersions: DesignVersion[];
  comments: ConceptComment[];
  // ТЗ для фабрики на 3 языках: 中文 / ENGLISH / РУССКИЙ (китайский первым, п. 7 ТЗ)
  techPack: {
    zh: TechPackTranslation;
    en: TechPackTranslation;
    ru: TechPackTranslation;
  };
  // Новые блоки единой карточки разработки Product Lab R&D v1.0 (п. 5–18 ТЗ)
  analysisReport?: RnDAnalysisReport;
  samples?: RnDSampleItem[];
  testProtocols?: RnDSampleTestProtocol[];
  approvalDecisions?: RnDApprovalDecision[];
  productionOrders?: RnDProductionOrder[];
  launchChecklist?: RnDLaunchChecklist;
  postLaunchMetrics?: RnDPostLaunchCheckpoint[];
  launchOutcome?: RnDLaunchOutcome;
  attachments?: RnDAttachmentItem[];
  stageHistory?: RnDStageHistoryEntry[];
  linkedProductId?: string;
  linkedScenarioModelId?: string;
  linkedLaunchId?: string;
  linkedCompetitorIds?: string[];
  linkedTaskIds?: string[];
  galleryPhotos?: { id: string; url: string; caption?: string }[];
  packUnitsCount?: number;
  marketplaceProductUrl?: string;
  actualLaunchDate?: string;
  launchSalesStatus?: 'prep' | 'in_sale';
  launchNote?: string;
  fourChecksTest?: {
    fitAndComfort: 'passed' | 'remarks' | 'failed' | 'untested';
    fitAndComfortComment?: string;
    fitAndComfortPhoto?: string;
    waistbandAndSeams: 'passed' | 'remarks' | 'failed' | 'untested';
    waistbandAndSeamsComment?: string;
    waistbandAndSeamsPhoto?: string;
    washShapeColor: 'passed' | 'remarks' | 'failed' | 'untested';
    washShapeColorComment?: string;
    washShapeColorPhoto?: string;
    manufacturingQuality: 'passed' | 'remarks' | 'failed' | 'untested';
    manufacturingQualityComment?: string;
    manufacturingQualityPhoto?: string;
  };
  isDemo: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type LaunchStageCode =
  | 'concept'
  | 'design'
  | 'sample'
  | 'testing'
  | 'production'
  | 'logistics'
  | 'cards'
  | 'marketing'
  | 'sales'
  | 'analysis';

export interface LaunchStage {
  code: LaunchStageCode;
  label: string;
  deadline: string;
  ownerId: string;
  status: 'Done' | 'In Progress' | 'Pending' | 'Delayed';
}

export interface Launch {
  id: string;
  name: string;
  brandId: string;
  collectionName: string;
  productIds: string[];
  conceptId?: string;
  startDate: string; // YYYY-MM-DD
  readinessPct: number;
  productionStatus: string;
  marketingBudgetRub: number;
  salesPlanUnits: number;
  salesPlanRub: number;
  ownerId: string;
  status: 'Подготовка' | 'В работе' | 'Согласование' | 'Готов к старту' | 'Запущен' | 'Завершён';
  imageUrl: string;
  stages: LaunchStage[];
  isDemo: boolean;
  isArchived: boolean;
  updatedAt: string;
}

export type MarketingChannel =
  | 'Wildberries'
  | 'Ozon'
  | 'Яндекс Маркет'
  | 'Собственный магазин'
  | 'Instagram/Reels'
  | 'Telegram'
  | 'Блогеры'
  | 'Прочие';

export interface CampaignMetrics {
  impressions?: number | null;
  reach?: number | null;
  clicks?: number | null;
  ctrPct?: number | null;
  cpcRub?: number | null;
  cpmRub?: number | null;
  orders?: number | null;
  buyouts?: number | null;
  revenueRub?: number | null;
  spendRub?: number | null;
  drrPct?: number | null;
  roas?: number | null;
  cacRub?: number | null;
  repeatPurchasePct?: number | null;
}

export interface Campaign {
  id: string;
  name: string;
  brandId: string;
  channel: MarketingChannel;
  goal: string;
  productIds: string[];
  launchId?: string;
  periodLabel: string;
  plannedBudgetRub: number;
  actualBudgetRub: number | null;
  plannedRevenueRub: number;
  actualRevenueRub: number | null;
  ownerId: string;
  status: 'Запланирована' | 'Активна' | 'Завершена' | 'На паузе';
  metrics: CampaignMetrics;
  isDemo: boolean;
  isArchived: boolean;
}

export interface GrowthExperiment {
  id: string;
  brandId: string;
  hypothesis: string;
  rationale: string;
  budgetRub: number;
  method: string;
  successCriteria: string;
  timeframe: string;
  resultSummary: string;
  decision: string;
  status: ExperimentStatus;
  ownerId: string;
  isDemo: boolean;
}

export interface FinancialPlanRow {
  id: string;
  brandId: string;
  scenario: FinancialScenario;
  periodMonth: string; // '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'
  periodLabel: string;
  currency: 'RUB';
  plannedBuyoutUnits: number;
  actualBuyoutUnits: number | null; // null = «Нет данных» (не путать с 0, п. 4 ТЗ)
  avgSellingPriceRub: number;
  plannedRevenueRub: number;
  actualRevenueRub: number | null; // null = «Нет данных»
  plannedOperatingProfitRub: number;
  actualOperatingProfitRub: number | null; // null = «Нет данных»
  fixedCostsRub: number;
  marketingBudgetRub: number;
  launchInvestmentRub: number;
  sourceLabel: string;
  updatedAt: string;
  updatedBy: string;
  isDemo: boolean;
}

export interface StrategicGoal {
  id: string;
  brandId: string | 'ALL';
  title: string;
  description: string;
  periodYear: number;
  periodQuarter: string;
  targetMetric: string;
  progressPct: number;
  status: 'В графике' | 'Внимание' | 'Под угрозой' | 'Выполнено';
  ownerId: string;
  isDemo: boolean;
}

export interface Project {
  id: string;
  brandId: string;
  strategicGoalId: string;
  conceptId?: string;
  launchId?: string;
  name: string;
  description: string;
  quarter: string;
  month: string;
  startDate: string;
  endDate: string;
  status: 'Планирование' | 'В работе' | 'На ревью' | 'Завершён';
  ownerId: string;
  isDemo: boolean;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  brandId: string;
  projectId: string;
  productId?: string;
  conceptId?: string;
  launchId?: string;
  assigneeId: string;
  priority: TaskPriority;
  deadline: string; // YYYY-MM-DD
  status: TaskStatus;
  comments: { id: string; authorName: string; text: string; createdAt: string }[];
  attachments: string[];
  isDemo: boolean;
  isArchived: boolean;
}

export interface Competitor {
  id: string;
  brandName: string;
  websiteUrl: string;
  marketplaces: string[];
  positioning: string;
  priceRangeRub: string;
  keyProducts: string;
  strengths: string;
  weaknesses: string;
  photoUrl: string;
  sources: string;
  researchedAt: string;
  isDemo: boolean;
}

export interface MarketOpportunity {
  id: string;
  brandId: string;
  title: string;
  audience: string;
  competitionLevel: 'Низкая' | 'Средняя' | 'Высокая';
  potentialDemand: string;
  economicsNote: string;
  complexity: 'Низкая' | 'Средняя' | 'Высокая';
  priority: TaskPriority;
  linkedConceptIds: string[];
  isDemo: boolean;
}

export interface ResearchItem {
  id: string;
  brandId: string | 'ALL';
  title: string;
  category: 'Тренды рынка' | 'Потребительские инсайты' | 'Материалы и фабрики' | 'Аналитика маркетплейсов';
  conclusions: string;
  sourceLinks: string[];
  researchDate: string;
  isDemo: boolean;
}

export type DocumentCategory =
  | 'производство'
  | 'поставщики'
  | 'каталоги'
  | 'дизайн'
  | 'аналитика'
  | 'маркетинг'
  | 'финансы'
  | 'стратегия'
  | 'прочее';

export interface DocumentItem {
  id: string;
  title: string;
  category: DocumentCategory;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  dataUrl?: string; // для загруженных пользователем файлов
  brandId: string | 'ALL';
  productId?: string;
  projectId?: string;
  conceptId?: string;
  launchId?: string;
  tags: string[];
  isFinancialRestricted: boolean;
  minRole: UserRole;
  uploadedBy: string;
  uploadedAt: string;
  isDemo: boolean;
  isArchived: boolean;
}

export interface AuditLogEntry {
  id: string;
  actorName: string;
  actorRole: UserRole;
  entityType: 'concept' | 'product' | 'launch' | 'strategy' | 'finance' | 'task' | 'document' | 'user' | 'brand';
  entityId: string;
  action: string;
  summary: string;
  createdAt: string;
}

export type MiroItemType = 'sticky' | 'photo' | 'voice' | 'concept_link';

export interface MiroBoardItem {
  id: string;
  type: MiroItemType;
  title: string;
  content: string;
  brandId: string | 'ALL';
  color: string;
  x: number;
  y: number;
  width: number;
  imageUrl?: string;
  galleryUrls?: string[];
  audioDataUrl?: string;
  audioDurationSec?: number;
  linkedConceptId?: string;
  connectedToIds?: string[];
  authorName: string;
  createdAt: string;
}
