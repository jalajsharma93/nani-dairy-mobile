import { Platform } from "react-native";
import Constants from "expo-constants";

const getBaseUrl = () => {
  // Prefer explicit env override for real devices or shared environments.
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  // In Expo Go/dev, derive host IP from Metro host URI for real devices.
  const hostUri =
    (Constants.expoConfig as { hostUri?: string } | null)?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | null)?.debuggerHost ??
    "";
  const detectedHost = hostUri.split(":")[0]?.trim();
  if (detectedHost && detectedHost !== "localhost" && detectedHost !== "127.0.0.1") {
    return `http://${detectedHost}:8080`;
  }

  // Android emulator maps host machine localhost to 10.0.2.2.
  if (Platform.OS === "android") {
    return "http://10.0.2.2:8080";
  }

  // Expo web + iOS simulator can use localhost.
  return "http://localhost:8080";
};

export const API_BASE_URL = getBaseUrl();
let AUTH_TOKEN: string | null = null;
const REQUEST_TIMEOUT_MS = 15000;

export type Shift = "AM" | "PM";
export type QcStatus = "PENDING" | "PASS" | "HOLD" | "REJECT";
export type AnimalStatus = "LACTATING" | "DRY" | "SICK" | "SOLD";
export type AnimalGrowthStage = "CALF" | "GROWER" | "ADULT";
export type BreedingPregnancyResult = "PENDING" | "PREGNANT" | "NOT_PREGNANT";
export type BreedingCalfGender = "MALE" | "FEMALE" | "UNKNOWN";
export type BreedingCalvingOutcome = "LIVE" | "STILLBIRTH" | "ABORTION" | "UNKNOWN";
export type EmployeeType = "FULL_TIME" | "PART_TIME";
export type EmployeeGovernmentIdType =
  | "AADHAAR"
  | "PAN"
  | "VOTER_ID"
  | "DRIVING_LICENSE"
  | "PASSPORT"
  | "OTHER";
export type UserRole = "ADMIN" | "MANAGER" | "WORKER" | "FEED_MANAGER" | "DELIVERY" | "VET";
export type FeedRationPhase = "LACTATING" | "PREGNANT" | "DRY" | "CALF" | "SICK_RECOVERY";
export type FeedMaterialCategory =
  | "GREEN_FODDER"
  | "DRY_FODDER"
  | "CONCENTRATE"
  | "MINERAL"
  | "ADDITIVE"
  | "OTHER";
export type FeedMaterialUnit = "KG" | "LITER" | "BAG" | "UNIT";
export type FeedSopTaskPriority = "LOW" | "MEDIUM" | "HIGH";
export type FeedSopTaskStatus = "PENDING" | "IN_PROGRESS" | "DONE";
export type CustomerType = "COOPERATIVE" | "RETAIL" | "INDIVIDUAL";
export type SubscriptionFrequency = "DAILY" | "WEEKLY";
export type ProductType =
  | "MILK"
  | "GHEE"
  | "CURD"
  | "PANEER"
  | "BUTTERMILK"
  | "DUNG"
  | "COMPOST";
export type PaymentMode = "CASH" | "UPI" | "BANK_TRANSFER" | "CARD" | "CREDIT";
export type SettlementCycle = "DAILY" | "WEEKLY" | "FORTNIGHTLY" | "MONTHLY";
export type ExpenseCategory =
  | "SALARY"
  | "FEED"
  | "VETERINARY"
  | "ELECTRICITY"
  | "WATER"
  | "EQUIPMENT"
  | "MAINTENANCE"
  | "TRANSPORT"
  | "MISC";

export type MilkBatchResponse = {
  milkBatchId: string;
  date: string;
  shift: Shift;
  totalLiters: number;
  qcStatus: QcStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type AnimalResponse = {
  animalId: string;
  tag: string;
  name?: string | null;
  breed: string;
  status: AnimalStatus;
  isActive: boolean;
  motherAnimalId?: string | null;
  sireTag?: string | null;
  dateOfBirth?: string | null;
  growthStage?: AnimalGrowthStage | null;
  birthWeightKg?: number | null;
  currentWeightKg?: number | null;
  lastWeightDate?: string | null;
  weaningDate?: string | null;
  weaningWeightKg?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateAnimalPayload = {
  tag: string;
  name?: string | null;
  breed: string;
  status: AnimalStatus;
  isActive: boolean;
  motherAnimalId?: string | null;
  sireTag?: string | null;
  dateOfBirth?: string | null;
  growthStage?: AnimalGrowthStage | null;
  birthWeightKg?: number | null;
  currentWeightKg?: number | null;
  lastWeightDate?: string | null;
  weaningDate?: string | null;
  weaningWeightKg?: number | null;
};
export type UpdateAnimalPayload = CreateAnimalPayload;

export type EmployeeResponse = {
  employeeId: string;
  name: string;
  phone?: string | null;
  roleTitle?: string | null;
  joinDate?: string | null;
  governmentIdType?: EmployeeGovernmentIdType | null;
  governmentIdNumber?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  bankAccountNumber?: string | null;
  ifscCode?: string | null;
  uan?: string | null;
  esicIpNumber?: string | null;
  type: EmployeeType;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateEmployeePayload = {
  name: string;
  phone: string;
  roleTitle: string;
  joinDate: string;
  governmentIdType: EmployeeGovernmentIdType;
  governmentIdNumber: string;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  bankAccountNumber?: string | null;
  ifscCode?: string | null;
  uan?: string | null;
  esicIpNumber?: string | null;
  type: EmployeeType;
  isActive: boolean;
};
export type UpdateEmployeePayload = CreateEmployeePayload;

export type SeedMvpResponse = {
  animalsAdded: number;
  employeesAdded: number;
  milkBatchesAdded: number;
  totalAnimals: number;
  totalEmployees: number;
  totalMilkBatches: number;
};

export type MigrateAnimalIdsResponse = {
  migratedCount: number;
  totalAnimals: number;
};

export type MilkEntryResponse = {
  milkEntryId: string;
  animalId: string;
  date: string;
  shift: Shift;
  liters: number;
  qcStatus: QcStatus;
  fat?: number | null;
  snf?: number | null;
  temperature?: number | null;
  lactometer?: number | null;
  smellNotes?: string | null;
  rejectionReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type SaveMilkEntriesPayload = {
  date: string;
  shift: Shift;
  entries: {
    animalId: string;
    liters: number;
  }[];
};

export type UpdateMilkEntriesQcPayload = {
  date: string;
  shift: Shift;
  entries: {
    animalId: string;
    qcStatus: QcStatus;
    fat?: number | null;
    snf?: number | null;
    temperature?: number | null;
    lactometer?: number | null;
    smellNotes?: string | null;
    rejectionReason?: string | null;
  }[];
};

export type DailyReportResponse = {
  date: string;
  amLiters: number;
  pmLiters: number;
  totalLiters: number;
  passBatches: number;
  holdBatches: number;
  rejectBatches: number;
  cowsQcDone: number;
  cowsQcPending: number;
};

export type WeeklyTrendPointResponse = {
  date: string;
  totalLiters: number;
  passBatches: number;
  totalBatches: number;
  passRate: number;
};

export type WeeklyTrendResponse = {
  startDate: string;
  endDate: string;
  points: WeeklyTrendPointResponse[];
};

export type SaleResponse = {
  saleId: string;
  dispatchDate: string;
  customerType: CustomerType;
  customerId?: string | null;
  customerName: string;
  productType: ProductType;
  quantity: number;
  unitPrice: number;
  baseUnitPrice?: number | null;
  routeName?: string | null;
  collectionPoint?: string | null;
  fatPercent?: number | null;
  snfPercent?: number | null;
  fatRatePerKg?: number | null;
  snfRatePerKg?: number | null;
  qualityPricingApplied?: boolean;
  settlementCycle?: SettlementCycle | null;
  reconciled?: boolean;
  reconciledAt?: string | null;
  reconciledBy?: string | null;
  reconciliationNote?: string | null;
  delivered?: boolean;
  deliveredAt?: string | null;
  deliveredBy?: string | null;
  deliveryNote?: string | null;
  totalAmount: number;
  receivedAmount: number;
  pendingAmount: number;
  subscriptionChargeApplied?: boolean;
  subscriptionBalanceImpact?: number;
  customerBalanceAfterSale?: number | null;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  paymentMode: PaymentMode;
  batchDate?: string | null;
  batchShift?: Shift | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateSalePayload = {
  dispatchDate: string;
  customerType: CustomerType;
  customerId?: string | null;
  customerName: string;
  productType: ProductType;
  quantity: number;
  unitPrice: number;
  receivedAmount?: number | null;
  paymentMode: PaymentMode;
  batchDate?: string | null;
  batchShift?: Shift | null;
  notes?: string | null;
  routeName?: string | null;
  collectionPoint?: string | null;
  fatPercent?: number | null;
  snfPercent?: number | null;
  fatRatePerKg?: number | null;
  snfRatePerKg?: number | null;
  settlementCycle?: SettlementCycle | null;
  overrideWithdrawalLock?: boolean | null;
  overrideReason?: string | null;
};

export type UpdateSalePayload = CreateSalePayload;

export type SaleOverrideAuditResponse = {
  saleOverrideAuditId: string;
  saleId: string;
  actionType: string;
  dispatchDate: string;
  batchDate: string;
  batchShift: Shift;
  customerName: string;
  actorUsername: string;
  overrideReason: string;
  blockedAnimalIds: string;
  blockedAnimalTags: string;
  createdAt?: string;
};

export type DeliveryChecklistItemResponse = {
  saleId: string;
  dispatchDate: string;
  customerName: string;
  productType: ProductType;
  quantity: number;
  routeName?: string | null;
  collectionPoint?: string | null;
  delivered: boolean;
  deliveredAt?: string | null;
  deliveredBy?: string | null;
  deliveryNote?: string | null;
  totalAmount: number;
  receivedAmount: number;
  pendingAmount: number;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
};

export type CustomerRecordResponse = {
  customerId: string;
  customerName: string;
  customerType: CustomerType;
  phone?: string | null;
  routeName?: string | null;
  collectionPoint?: string | null;
  subscriptionActive: boolean;
  dailySubscriptionQty?: number | null;
  subscriptionFrequency?: SubscriptionFrequency | null;
  runningBalance: number;
  totalPaid: number;
  lastPayoutDate?: string | null;
  isActive: boolean;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateCustomerRecordPayload = {
  customerName: string;
  customerType: CustomerType;
  phone?: string | null;
  routeName?: string | null;
  collectionPoint?: string | null;
  subscriptionActive?: boolean;
  dailySubscriptionQty?: number | null;
  subscriptionFrequency?: SubscriptionFrequency | null;
  isActive?: boolean;
  notes?: string | null;
};

export type UpdateCustomerRecordPayload = CreateCustomerRecordPayload;

export type RecordCustomerPayoutPayload = {
  amount: number;
  payoutDate?: string | null;
  note?: string | null;
};

export type ExpenseResponse = {
  expenseId: string;
  expenseDate: string;
  category: ExpenseCategory;
  amount: number;
  paymentMode: PaymentMode;
  referenceNo?: string | null;
  counterparty?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateExpensePayload = {
  expenseDate: string;
  category: ExpenseCategory;
  amount: number;
  paymentMode: PaymentMode;
  referenceNo?: string | null;
  counterparty?: string | null;
  notes?: string | null;
};

export type UpdateExpensePayload = CreateExpensePayload;

export type ExpensesSummaryResponse = {
  date: string;
  totalAmount: number;
  salaryAmount: number;
  otherAmount: number;
  totalTransactions: number;
};
export type SalesSummaryResponse = {
  date: string;
  totalRevenue: number;
  milkRevenue: number;
  otherRevenue: number;
  totalReceived: number;
  totalPending: number;
  totalTransactions: number;
};

export type CustomerLedgerRowResponse = {
  customerName: string;
  customerType: CustomerType;
  totalAmount: number;
  totalReceived: number;
  totalPending: number;
  totalQuantity: number;
  totalTransactions: number;
};

export type SettlementReconciliationRowResponse = {
  customerName: string;
  customerType: CustomerType;
  routeName?: string | null;
  collectionPoint?: string | null;
  settlementCycle: SettlementCycle;
  totalAmount: number;
  totalReceived: number;
  totalPending: number;
  totalQuantity: number;
  totalTransactions: number;
  reconciledTransactions: number;
  unreconciledTransactions: number;
};

export type FeedLogResponse = {
  feedLogId: string;
  feedDate: string;
  animalId: string;
  feedType: string;
  rationPhase?: FeedRationPhase | null;
  quantityKg: number;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateFeedLogPayload = {
  feedDate: string;
  animalId: string;
  feedType: string;
  rationPhase?: FeedRationPhase | null;
  quantityKg: number;
  notes?: string | null;
};

export type UpdateFeedLogPayload = CreateFeedLogPayload;

export type FeedMaterialResponse = {
  feedMaterialId: string;
  materialName: string;
  category: FeedMaterialCategory;
  unit: FeedMaterialUnit;
  availableQty: number;
  reorderLevelQty: number;
  costPerUnit?: number | null;
  supplierName?: string | null;
  notes?: string | null;
  lowStock: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateFeedMaterialPayload = {
  materialName: string;
  category: FeedMaterialCategory;
  unit: FeedMaterialUnit;
  availableQty: number;
  reorderLevelQty: number;
  costPerUnit?: number | null;
  supplierName?: string | null;
  notes?: string | null;
};

export type UpdateFeedMaterialPayload = CreateFeedMaterialPayload;

export type FeedRecipeResponse = {
  feedRecipeId: string;
  recipeName: string;
  rationPhase: FeedRationPhase;
  targetAnimalCount?: number | null;
  ingredients: string;
  instructions?: string | null;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateFeedRecipePayload = {
  recipeName: string;
  rationPhase: FeedRationPhase;
  targetAnimalCount?: number | null;
  ingredients: string;
  instructions?: string | null;
  active?: boolean;
};

export type UpdateFeedRecipePayload = {
  recipeName: string;
  rationPhase: FeedRationPhase;
  targetAnimalCount?: number | null;
  ingredients: string;
  instructions?: string | null;
  active: boolean;
};

export type FeedSopTaskResponse = {
  feedTaskId: string;
  taskDate: string;
  title: string;
  details?: string | null;
  assignedRole: UserRole;
  priority: FeedSopTaskPriority;
  status: FeedSopTaskStatus;
  dueTime?: string | null;
  completedAt?: string | null;
  completedBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateFeedSopTaskPayload = {
  taskDate: string;
  title: string;
  details?: string | null;
  assignedRole?: UserRole;
  priority?: FeedSopTaskPriority;
  dueTime?: string | null;
};

export type UpdateFeedSopTaskPayload = {
  taskDate: string;
  title: string;
  details?: string | null;
  assignedRole: UserRole;
  priority: FeedSopTaskPriority;
  status: FeedSopTaskStatus;
  dueTime?: string | null;
};

export type FeedManagementSummaryResponse = {
  date: string;
  totalMaterials: number;
  lowStockMaterials: number;
  activeRecipes: number;
  openTasks: number;
  doneTasksToday: number;
  totalInventoryValue: number;
};

export type VaccinationResponse = {
  vaccinationId: string;
  animalId: string;
  vaccineName: string;
  diseaseTarget: string;
  doseDate: string;
  doseNumber?: number | null;
  boosterDueDate?: string | null;
  nextDueDate?: string | null;
  vaccineExpiryDate?: string | null;
  batchLotNo?: string | null;
  route?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateVaccinationPayload = {
  vaccineName: string;
  diseaseTarget: string;
  doseDate: string;
  doseNumber?: number | null;
  boosterDueDate?: string | null;
  nextDueDate?: string | null;
  vaccineExpiryDate?: string | null;
  batchLotNo?: string | null;
  route?: string | null;
  notes?: string | null;
};

export type DewormingResponse = {
  dewormingId: string;
  animalId: string;
  drugName: string;
  doseDate: string;
  nextDueDate?: string | null;
  weightAtDoseKg?: number | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateDewormingPayload = {
  drugName: string;
  doseDate: string;
  nextDueDate?: string | null;
  weightAtDoseKg?: number | null;
  notes?: string | null;
};

export type MedicalTreatmentResponse = {
  treatmentId: string;
  animalId: string;
  treatmentDate: string;
  diagnosis: string;
  medicineName: string;
  dose?: string | null;
  route?: string | null;
  veterinarianName?: string | null;
  prescriptionPhotoUrl?: string | null;
  withdrawalTillDate?: string | null;
  followUpDate?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateMedicalTreatmentPayload = {
  treatmentDate: string;
  diagnosis: string;
  medicineName: string;
  dose?: string | null;
  route?: string | null;
  veterinarianName?: string | null;
  prescriptionPhotoUrl?: string | null;
  withdrawalTillDate?: string | null;
  followUpDate?: string | null;
  notes?: string | null;
};

export type HealthSummaryResponse = {
  date: string;
  windowDays: number;
  vaccinationsDueToday: number;
  vaccinationsDueSoon: number;
  vaccinationsOverdue: number;
  dewormingDueToday: number;
  dewormingDueSoon: number;
  dewormingOverdue: number;
};

export type BreedingEventResponse = {
  breedingEventId: string;
  animalId: string;
  heatDate: string;
  inseminationDate?: string | null;
  sireTag?: string | null;
  pregnancyCheckDate?: string | null;
  pregnancyResult: BreedingPregnancyResult;
  expectedCalvingDate?: string | null;
  actualCalvingDate?: string | null;
  calfAnimalId?: string | null;
  calfTag?: string | null;
  calfGender: BreedingCalfGender;
  calvingOutcome: BreedingCalvingOutcome;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateBreedingEventPayload = {
  heatDate: string;
  inseminationDate?: string | null;
  sireTag?: string | null;
  pregnancyCheckDate?: string | null;
  pregnancyResult?: BreedingPregnancyResult | null;
  expectedCalvingDate?: string | null;
  actualCalvingDate?: string | null;
  calfAnimalId?: string | null;
  calfTag?: string | null;
  calfGender?: BreedingCalfGender | null;
  calvingOutcome?: BreedingCalvingOutcome | null;
  notes?: string | null;
};

export type BreedingSummaryResponse = {
  date: string;
  windowDays: number;
  calvingDueToday: number;
  calvingDueSoon: number;
  calvingOverdue: number;
  openPregnancies: number;
};

export type WorklistTaskType =
  | "VACCINATION_DUE"
  | "DEWORMING_DUE"
  | "PREGNANCY_CHECK_DUE"
  | "CALVING_DUE"
  | "REPEAT_BREEDER"
  | "MASTITIS_FOLLOW_UP"
  | "LOW_YIELD";

export type WorklistPriority = "HIGH" | "MEDIUM" | "LOW";
export type WorklistDueStatus = "OVERDUE" | "DUE_TODAY" | "DUE_SOON" | "INFO";

export type WorklistItemResponse = {
  taskId: string;
  type: WorklistTaskType;
  priority: WorklistPriority;
  dueStatus: WorklistDueStatus;
  dueDate?: string | null;
  animalId?: string | null;
  animalTag?: string | null;
  sourceId?: string | null;
  title: string;
  description?: string | null;
};

export type WorklistResponse = {
  date: string;
  windowDays: number;
  generatedAt: string;
  totalTasks: number;
  highPriorityCount: number;
  mediumPriorityCount: number;
  lowPriorityCount: number;
  overdueCount: number;
  dueTodayCount: number;
  dueSoonCount: number;
  items: WorklistItemResponse[];
};

export type AuthUserResponse = {
  userId: string;
  username: string;
  fullName: string;
  role: UserRole;
  active: boolean;
};

export type CreateAuthUserPayload = {
  username: string;
  fullName: string;
  role: UserRole;
  password: string;
  active?: boolean;
};

export type UpdateAuthUserPayload = {
  fullName: string;
  role: UserRole;
  active: boolean;
  password?: string | null;
};

export type ResetAuthUserPasswordPayload = {
  newPassword: string;
};

export type ChangePasswordPayload = {
  currentPassword: string;
  newPassword: string;
};

export type AuthUserAuditResponse = {
  auditId: string;
  actorUsername: string;
  action: string;
  targetUserId?: string | null;
  targetUsername?: string | null;
  details?: string | null;
  createdAt: string;
};

export type LoginPayload = {
  username: string;
  password: string;
};

export type LoginResponse = {
  token: string;
  tokenType: string;
  expiresAt: string;
  user: AuthUserResponse;
};

export type UploadFileResponse = {
  fileName: string;
  url: string;
  contentType?: string | null;
  sizeBytes: number;
};

export type UploadFilePayload = {
  uri: string;
  name: string;
  type: string;
};

export function setApiAuthToken(token: string | null) {
  AUTH_TOKEN = token;
}

async function http<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  const isFormData = typeof FormData !== "undefined" && options?.body instanceof FormData;
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (AUTH_TOKEN) {
    headers.set("Authorization", `Bearer ${AUTH_TOKEN}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      headers,
      ...options,
      signal: controller.signal,
    });
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error(
        `Request timed out. Check API URL/network. Current BASE_URL: ${API_BASE_URL}`
      );
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

export const MilkApi = {
  getBatch: (date: string, shift: Shift) =>
    http<MilkBatchResponse | null>(
      `${API_BASE_URL}/api/milk-batches?date=${date}&shift=${shift}`
    ),

  saveBatch: (payload: { date: string; shift: Shift; totalLiters: number }) =>
    http<MilkBatchResponse>(`${API_BASE_URL}/api/milk-batches`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateQc: (payload: { date: string; shift: Shift; qcStatus: QcStatus }) =>
    http<MilkBatchResponse>(`${API_BASE_URL}/api/milk-batches/qc`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export const MilkEntryApi = {
  list: (date: string, shift: Shift) =>
    http<MilkEntryResponse[]>(`${API_BASE_URL}/api/milk-entries?date=${date}&shift=${shift}`),

  historyByAnimal: (animalId: string, dateFrom: string, dateTo: string) =>
    http<MilkEntryResponse[]>(
      `${API_BASE_URL}/api/milk-entries/history?animalId=${animalId}&dateFrom=${dateFrom}&dateTo=${dateTo}`
    ),

  saveEntries: (payload: SaveMilkEntriesPayload) =>
    http<MilkEntryResponse[]>(`${API_BASE_URL}/api/milk-entries/bulk`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateQc: (payload: UpdateMilkEntriesQcPayload) =>
    http<MilkEntryResponse[]>(`${API_BASE_URL}/api/milk-entries/qc`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export const AnimalApi = {
  list: (params?: { active?: boolean; status?: AnimalStatus }) => {
    const search = new URLSearchParams();
    if (params?.active !== undefined) {
      search.set("active", String(params.active));
    }
    if (params?.status) {
      search.set("status", params.status);
    }
    const query = search.toString();
    return http<AnimalResponse[]>(`${API_BASE_URL}/api/animals${query ? `?${query}` : ""}`);
  },

  get: (animalId: string) =>
    http<AnimalResponse>(`${API_BASE_URL}/api/animals/${encodeURIComponent(animalId)}`),

  create: (payload: CreateAnimalPayload) =>
    http<AnimalResponse>(`${API_BASE_URL}/api/animals`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: (animalId: string, payload: UpdateAnimalPayload) =>
    http<AnimalResponse>(`${API_BASE_URL}/api/animals/${animalId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
};

export const EmployeeApi = {
  list: (params?: { active?: boolean; type?: EmployeeType }) => {
    const search = new URLSearchParams();
    if (params?.active !== undefined) {
      search.set("active", String(params.active));
    }
    if (params?.type) {
      search.set("type", params.type);
    }
    const query = search.toString();
    return http<EmployeeResponse[]>(`${API_BASE_URL}/api/employees${query ? `?${query}` : ""}`);
  },

  create: (payload: CreateEmployeePayload) =>
    http<EmployeeResponse>(`${API_BASE_URL}/api/employees`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: (employeeId: string, payload: UpdateEmployeePayload) =>
    http<EmployeeResponse>(`${API_BASE_URL}/api/employees/${employeeId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
};

export const AdminApi = {
  seedMvp: () =>
    http<SeedMvpResponse>(`${API_BASE_URL}/api/admin/seed-mvp`, {
      method: "POST",
    }),

  migrateAnimalIds: () =>
    http<MigrateAnimalIdsResponse>(`${API_BASE_URL}/api/admin/migrate-animal-ids`, {
      method: "POST",
    }),
};

export const AuthApi = {
  login: (payload: LoginPayload) =>
    http<LoginResponse>(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  me: () => http<AuthUserResponse>(`${API_BASE_URL}/api/auth/me`),

  listUsers: () => http<AuthUserResponse[]>(`${API_BASE_URL}/api/auth/users`),

  createUser: (payload: CreateAuthUserPayload) =>
    http<AuthUserResponse>(`${API_BASE_URL}/api/auth/users`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateUser: (userId: string, payload: UpdateAuthUserPayload) =>
    http<AuthUserResponse>(`${API_BASE_URL}/api/auth/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deactivateUser: (userId: string) =>
    http<AuthUserResponse>(`${API_BASE_URL}/api/auth/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    }),

  resetUserPassword: (userId: string, payload: ResetAuthUserPasswordPayload) =>
    http<AuthUserResponse>(`${API_BASE_URL}/api/auth/users/${encodeURIComponent(userId)}/reset-password`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  changePassword: (payload: ChangePasswordPayload) =>
    http<void>(`${API_BASE_URL}/api/auth/change-password`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listUserAudits: (limit = 100) =>
    http<AuthUserAuditResponse[]>(`${API_BASE_URL}/api/auth/users/audits?limit=${limit}`),
};

export const ReportApi = {
  daily: (date: string) =>
    http<DailyReportResponse>(`${API_BASE_URL}/api/reports/daily?date=${date}`),

  weekly: (date: string, days = 7) =>
    http<WeeklyTrendResponse>(`${API_BASE_URL}/api/reports/weekly?date=${date}&days=${days}`),
};

export const SalesApi = {
  list: (params?: { date?: string; customerType?: CustomerType; productType?: ProductType }) => {
    const search = new URLSearchParams();
    if (params?.date) search.set("date", params.date);
    if (params?.customerType) search.set("customerType", params.customerType);
    if (params?.productType) search.set("productType", params.productType);
    const query = search.toString();
    return http<SaleResponse[]>(`${API_BASE_URL}/api/sales${query ? `?${query}` : ""}`);
  },

  create: (payload: CreateSalePayload) =>
    http<SaleResponse>(`${API_BASE_URL}/api/sales`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: (saleId: string, payload: UpdateSalePayload) =>
    http<SaleResponse>(`${API_BASE_URL}/api/sales/${saleId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  summary: (date: string) =>
    http<SalesSummaryResponse>(`${API_BASE_URL}/api/sales/summary?date=${date}`),

  ledger: (dateFrom: string, dateTo?: string) =>
    http<CustomerLedgerRowResponse[]>(
      `${API_BASE_URL}/api/sales/ledger?dateFrom=${dateFrom}&dateTo=${dateTo ?? dateFrom}`
    ),

  overrideAudits: (dateFrom: string, dateTo?: string) =>
    http<SaleOverrideAuditResponse[]>(
      `${API_BASE_URL}/api/sales/override-audits?dateFrom=${dateFrom}&dateTo=${dateTo ?? dateFrom}`
    ),

  reconciliation: (dateFrom: string, dateTo?: string) =>
    http<SettlementReconciliationRowResponse[]>(
      `${API_BASE_URL}/api/sales/reconciliation?dateFrom=${dateFrom}&dateTo=${dateTo ?? dateFrom}`
    ),

  reconcile: (saleId: string, payload: { reconciled: boolean; note?: string | null }) =>
    http<SaleResponse>(`${API_BASE_URL}/api/sales/${saleId}/reconcile`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  deliveryList: (date: string) =>
    http<DeliveryChecklistItemResponse[]>(`${API_BASE_URL}/api/sales/delivery-list?date=${date}`),

  updateDelivery: (
    saleId: string,
    payload: { delivered: boolean; deliveryNote?: string | null; collectedAmount?: number | null }
  ) =>
    http<DeliveryChecklistItemResponse>(`${API_BASE_URL}/api/sales/${saleId}/delivery`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export const CustomerApi = {
  list: (params?: { active?: boolean }) => {
    const search = new URLSearchParams();
    if (params?.active !== undefined) {
      search.set("active", String(params.active));
    }
    const query = search.toString();
    return http<CustomerRecordResponse[]>(`${API_BASE_URL}/api/customers${query ? `?${query}` : ""}`);
  },

  create: (payload: CreateCustomerRecordPayload) =>
    http<CustomerRecordResponse>(`${API_BASE_URL}/api/customers`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: (customerId: string, payload: UpdateCustomerRecordPayload) =>
    http<CustomerRecordResponse>(`${API_BASE_URL}/api/customers/${encodeURIComponent(customerId)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  recordPayout: (customerId: string, payload: RecordCustomerPayoutPayload) =>
    http<CustomerRecordResponse>(`${API_BASE_URL}/api/customers/${encodeURIComponent(customerId)}/payout`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export const ExpenseApi = {
  list: (params?: { date?: string; category?: ExpenseCategory; paymentMode?: PaymentMode }) => {
    const search = new URLSearchParams();
    if (params?.date) search.set("date", params.date);
    if (params?.category) search.set("category", params.category);
    if (params?.paymentMode) search.set("paymentMode", params.paymentMode);
    const query = search.toString();
    return http<ExpenseResponse[]>(`${API_BASE_URL}/api/expenses${query ? `?${query}` : ""}`);
  },

  create: (payload: CreateExpensePayload) =>
    http<ExpenseResponse>(`${API_BASE_URL}/api/expenses`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: (expenseId: string, payload: UpdateExpensePayload) =>
    http<ExpenseResponse>(`${API_BASE_URL}/api/expenses/${expenseId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  summary: (date: string) =>
    http<ExpensesSummaryResponse>(`${API_BASE_URL}/api/expenses/summary?date=${date}`),
};

export const FeedApi = {
  list: (params?: { date?: string; animalId?: string }) => {
    const search = new URLSearchParams();
    if (params?.date) search.set("date", params.date);
    if (params?.animalId) search.set("animalId", params.animalId);
    const query = search.toString();
    return http<FeedLogResponse[]>(`${API_BASE_URL}/api/feed-logs${query ? `?${query}` : ""}`);
  },

  create: (payload: CreateFeedLogPayload) =>
    http<FeedLogResponse>(`${API_BASE_URL}/api/feed-logs`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: (feedLogId: string, payload: UpdateFeedLogPayload) =>
    http<FeedLogResponse>(`${API_BASE_URL}/api/feed-logs/${feedLogId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
};

export const FeedManagementApi = {
  summary: (date: string) =>
    http<FeedManagementSummaryResponse>(`${API_BASE_URL}/api/feed-management/summary?date=${date}`),

  listMaterials: (params?: { lowStockOnly?: boolean }) => {
    const search = new URLSearchParams();
    if (params?.lowStockOnly !== undefined) {
      search.set("lowStockOnly", String(params.lowStockOnly));
    }
    const query = search.toString();
    return http<FeedMaterialResponse[]>(
      `${API_BASE_URL}/api/feed-management/materials${query ? `?${query}` : ""}`
    );
  },

  createMaterial: (payload: CreateFeedMaterialPayload) =>
    http<FeedMaterialResponse>(`${API_BASE_URL}/api/feed-management/materials`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateMaterial: (materialId: string, payload: UpdateFeedMaterialPayload) =>
    http<FeedMaterialResponse>(`${API_BASE_URL}/api/feed-management/materials/${materialId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  adjustMaterial: (materialId: string, payload: { quantityDelta: number; reason?: string | null }) =>
    http<FeedMaterialResponse>(`${API_BASE_URL}/api/feed-management/materials/${materialId}/adjust`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listRecipes: (params?: { activeOnly?: boolean; rationPhase?: FeedRationPhase }) => {
    const search = new URLSearchParams();
    if (params?.activeOnly !== undefined) search.set("activeOnly", String(params.activeOnly));
    if (params?.rationPhase) search.set("rationPhase", params.rationPhase);
    const query = search.toString();
    return http<FeedRecipeResponse[]>(
      `${API_BASE_URL}/api/feed-management/recipes${query ? `?${query}` : ""}`
    );
  },

  createRecipe: (payload: CreateFeedRecipePayload) =>
    http<FeedRecipeResponse>(`${API_BASE_URL}/api/feed-management/recipes`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateRecipe: (recipeId: string, payload: UpdateFeedRecipePayload) =>
    http<FeedRecipeResponse>(`${API_BASE_URL}/api/feed-management/recipes/${recipeId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  listTasks: (params?: { date?: string; status?: FeedSopTaskStatus; assignedRole?: UserRole }) => {
    const search = new URLSearchParams();
    if (params?.date) search.set("date", params.date);
    if (params?.status) search.set("status", params.status);
    if (params?.assignedRole) search.set("assignedRole", params.assignedRole);
    const query = search.toString();
    return http<FeedSopTaskResponse[]>(
      `${API_BASE_URL}/api/feed-management/tasks${query ? `?${query}` : ""}`
    );
  },

  createTask: (payload: CreateFeedSopTaskPayload) =>
    http<FeedSopTaskResponse>(`${API_BASE_URL}/api/feed-management/tasks`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateTask: (taskId: string, payload: UpdateFeedSopTaskPayload) =>
    http<FeedSopTaskResponse>(`${API_BASE_URL}/api/feed-management/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  updateTaskStatus: (taskId: string, payload: { status: FeedSopTaskStatus }) =>
    http<FeedSopTaskResponse>(`${API_BASE_URL}/api/feed-management/tasks/${taskId}/status`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export const HealthApi = {
  summary: (date: string, windowDays = 7) =>
    http<HealthSummaryResponse>(
      `${API_BASE_URL}/api/health/summary?date=${date}&windowDays=${windowDays}`
    ),

  listVaccinations: (animalId: string) =>
    http<VaccinationResponse[]>(`${API_BASE_URL}/api/animals/${animalId}/vaccinations`),

  createVaccination: (animalId: string, payload: CreateVaccinationPayload) =>
    http<VaccinationResponse>(`${API_BASE_URL}/api/animals/${animalId}/vaccinations`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateVaccination: (
    animalId: string,
    vaccinationId: string,
    payload: CreateVaccinationPayload
  ) =>
    http<VaccinationResponse>(
      `${API_BASE_URL}/api/animals/${animalId}/vaccinations/${vaccinationId}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      }
    ),

  deleteVaccination: (animalId: string, vaccinationId: string) =>
    http<null>(`${API_BASE_URL}/api/animals/${animalId}/vaccinations/${vaccinationId}`, {
      method: "DELETE",
    }),

  listDeworming: (animalId: string) =>
    http<DewormingResponse[]>(`${API_BASE_URL}/api/animals/${animalId}/deworming`),

  createDeworming: (animalId: string, payload: CreateDewormingPayload) =>
    http<DewormingResponse>(`${API_BASE_URL}/api/animals/${animalId}/deworming`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateDeworming: (
    animalId: string,
    dewormingId: string,
    payload: CreateDewormingPayload
  ) =>
    http<DewormingResponse>(`${API_BASE_URL}/api/animals/${animalId}/deworming/${dewormingId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteDeworming: (animalId: string, dewormingId: string) =>
    http<null>(`${API_BASE_URL}/api/animals/${animalId}/deworming/${dewormingId}`, {
      method: "DELETE",
    }),
};

export const TreatmentApi = {
  list: (animalId: string) =>
    http<MedicalTreatmentResponse[]>(
      `${API_BASE_URL}/api/animals/${encodeURIComponent(animalId)}/treatments`
    ),

  create: (animalId: string, payload: CreateMedicalTreatmentPayload) =>
    http<MedicalTreatmentResponse>(
      `${API_BASE_URL}/api/animals/${encodeURIComponent(animalId)}/treatments`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ),

  update: (animalId: string, treatmentId: string, payload: CreateMedicalTreatmentPayload) =>
    http<MedicalTreatmentResponse>(
      `${API_BASE_URL}/api/animals/${encodeURIComponent(animalId)}/treatments/${encodeURIComponent(
        treatmentId
      )}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      }
    ),

  delete: (animalId: string, treatmentId: string) =>
    http<null>(
      `${API_BASE_URL}/api/animals/${encodeURIComponent(animalId)}/treatments/${encodeURIComponent(
        treatmentId
      )}`,
      {
        method: "DELETE",
      }
    ),
};

export const BreedingApi = {
  summary: (date: string, windowDays = 7) =>
    http<BreedingSummaryResponse>(
      `${API_BASE_URL}/api/breeding/summary?date=${date}&windowDays=${windowDays}`
    ),

  list: (animalId: string) =>
    http<BreedingEventResponse[]>(
      `${API_BASE_URL}/api/animals/${encodeURIComponent(animalId)}/breeding-events`
    ),

  create: (animalId: string, payload: CreateBreedingEventPayload) =>
    http<BreedingEventResponse>(
      `${API_BASE_URL}/api/animals/${encodeURIComponent(animalId)}/breeding-events`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ),

  update: (animalId: string, breedingEventId: string, payload: CreateBreedingEventPayload) =>
    http<BreedingEventResponse>(
      `${API_BASE_URL}/api/animals/${encodeURIComponent(animalId)}/breeding-events/${encodeURIComponent(
        breedingEventId
      )}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      }
    ),

  delete: (animalId: string, breedingEventId: string) =>
    http<null>(
      `${API_BASE_URL}/api/animals/${encodeURIComponent(animalId)}/breeding-events/${encodeURIComponent(
        breedingEventId
      )}`,
      {
        method: "DELETE",
      }
    ),
};

export const UploadApi = {
  uploadPrescription: (payload: UploadFilePayload) => {
    const form = new FormData();
    form.append("file", payload as any);
    return http<UploadFileResponse>(`${API_BASE_URL}/api/uploads/prescriptions`, {
      method: "POST",
      body: form,
    });
  },
};

export const WorklistApi = {
  today: (date: string, windowDays = 7) =>
    http<WorklistResponse>(
      `${API_BASE_URL}/api/worklist/today?date=${encodeURIComponent(date)}&windowDays=${windowDays}`
    ),
};
