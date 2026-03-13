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
export type AttendanceStatus = "PRESENT" | "ABSENT";
export type CompensationAdjustmentType = "ADVANCE" | "DEDUCTION" | "BONUS" | "PRODUCTION_INCENTIVE";
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

export type MilkBatchQcEvaluationResponse = {
  date: string;
  shift: Shift;
  recommendedQcStatus: QcStatus;
  reviewedEntries: number;
  passEntries: number;
  holdEntries: number;
  rejectEntries: number;
  lowFatHoldCount: number;
  lowFatRejectCount: number;
  lowSnfHoldCount: number;
  lowSnfRejectCount: number;
  highTemperatureHoldCount: number;
  lactometerOutOfRangeHoldCount: number;
  badSmellHoldCount: number;
  abnormalColorHoldCount: number;
  highAcidityHoldCount: number;
  waterAdulterationRejectCount: number;
  antibioticResidueRejectCount: number;
  highBacterialCountHoldCount: number;
  explicitRejectCount: number;
  triggerCodes: string[];
};

export type MilkQcOverrideAuditResponse = {
  milkQcOverrideAuditId: string;
  batchDate: string;
  shift: Shift;
  requestedQcStatus: QcStatus;
  recommendedQcStatus: QcStatus;
  appliedQcStatus: QcStatus;
  overrideRequested: boolean;
  overrideApproved: boolean;
  overrideReason?: string | null;
  triggerCodesCsv?: string | null;
  actorUsername?: string | null;
  actorRole?: string | null;
  createdAt?: string | null;
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

export type EmployeeAttendanceResponse = {
  attendanceId: string;
  employeeId: string;
  employeeName?: string | null;
  attendanceDate: string;
  shift: Shift;
  status: AttendanceStatus;
  hoursWorked?: number | null;
  notes?: string | null;
  markedByUsername?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type SalaryComputationMode = "NONE" | "DAILY" | "SHIFT" | "HOURLY" | "DAILY_PLUS_OVERTIME";

export type UpsertEmployeeAttendancePayload = {
  employeeId: string;
  attendanceDate: string;
  shift: Shift;
  status: AttendanceStatus;
  hoursWorked?: number | null;
  notes?: string | null;
};

export type BulkUpsertEmployeeAttendancePayload = {
  entries: UpsertEmployeeAttendancePayload[];
};

export type EmployeeAttendanceMonthlyRowResponse = {
  employeeId: string;
  employeeName?: string | null;
  employeeType: EmployeeType;
  active: boolean;
  workingDaysInMonth: number;
  presentDays: number;
  absentDays: number;
  presentShifts: number;
  absentShifts: number;
  shiftsMarked: number;
  totalHoursWorked: number;
  avgHoursPerPresentDay: number;
  overtimeHours: number;
  suggestedSalary: number;
  bonusAmount: number;
  productionIncentiveAmount: number;
  advanceAmount: number;
  deductionAmount: number;
  grossSalary: number;
  netPayableSalary: number;
};

export type EmployeeAttendanceMonthlyReportResponse = {
  month: string;
  dateFrom: string;
  dateTo: string;
  includeInactive: boolean;
  includeAdjustments: boolean;
  salaryMode: SalaryComputationMode;
  fullTimeDailyRate: number;
  partTimeDailyRate: number;
  fullTimeShiftRate: number;
  partTimeShiftRate: number;
  hourlyRate: number;
  overtimeHourlyRate: number;
  standardHoursPerDay: number;
  totalEmployees: number;
  totalPresentDays: number;
  totalAbsentDays: number;
  totalPresentShifts: number;
  totalAbsentShifts: number;
  totalHoursWorked: number;
  totalOvertimeHours: number;
  totalSuggestedSalary: number;
  totalBonusAmount: number;
  totalProductionIncentiveAmount: number;
  totalAdvanceAmount: number;
  totalDeductionAmount: number;
  totalGrossSalary: number;
  totalNetPayableSalary: number;
  rows: EmployeeAttendanceMonthlyRowResponse[];
};

export type EmployeeAttendanceMonthlyReportParams = {
  month: string;
  includeInactive?: boolean;
  includeAdjustments?: boolean;
  salaryMode?: SalaryComputationMode;
  fullTimeDailyRate?: number | null;
  partTimeDailyRate?: number | null;
  fullTimeShiftRate?: number | null;
  partTimeShiftRate?: number | null;
  hourlyRate?: number | null;
  overtimeHourlyRate?: number | null;
  standardHoursPerDay?: number | null;
};

export type EmployeeCompensationAdjustmentResponse = {
  adjustmentId: string;
  employeeId: string;
  employeeName?: string | null;
  adjustmentMonth: string;
  adjustmentDate: string;
  adjustmentType: CompensationAdjustmentType;
  amount: number;
  notes?: string | null;
  createdByUsername?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateEmployeeCompensationAdjustmentPayload = {
  employeeId: string;
  adjustmentDate: string;
  adjustmentType: CompensationAdjustmentType;
  amount: number;
  notes?: string | null;
};

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
  colorObservation?: string | null;
  acidity?: number | null;
  waterAdulteration?: boolean | null;
  antibioticResidue?: boolean | null;
  bacterialCount?: number | null;
  labTestAttachmentUrl?: string | null;
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
    colorObservation?: string | null;
    acidity?: number | null;
    waterAdulteration?: boolean | null;
    antibioticResidue?: boolean | null;
    bacterialCount?: number | null;
    labTestAttachmentUrl?: string | null;
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

export type AnimalProfitabilityResponse = {
  animalId: string;
  fromDate: string;
  toDate: string;
  windowDays: number;
  avgMilkPrice: number;
  animalMilkLiters: number;
  totalMilkLiters: number;
  avgMilkPerDay: number;
  animalFeedKg: number;
  animalTreatmentCount: number;
  estimatedRevenue: number;
  estimatedFeedCost: number;
  estimatedTreatmentCost: number;
  estimatedLaborCost: number;
  estimatedTotalCost: number;
  estimatedNet: number;
  roiPercent?: number | null;
  feedCostPerKg: number;
  treatmentCostPerCase: number;
  laborCostPerLiter: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  cullingReviewSuggested: boolean;
  recommendation: string;
  warnings: string[];
};

export type HerdProfitabilityItemResponse = {
  animalId: string;
  tag: string;
  name?: string | null;
  breed: string;
  status: AnimalStatus;
  active: boolean;
  animalMilkLiters: number;
  avgMilkPerDay: number;
  animalFeedKg: number;
  animalTreatmentCount: number;
  estimatedRevenue: number;
  estimatedFeedCost: number;
  estimatedTreatmentCost: number;
  estimatedLaborCost: number;
  estimatedTotalCost: number;
  estimatedNet: number;
  roiPercent?: number | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  cullingReviewSuggested: boolean;
  recommendation: string;
  warnings: string[];
};

export type HerdProfitabilityResponse = {
  fromDate: string;
  toDate: string;
  windowDays: number;
  totalAnimals: number;
  positiveAnimals: number;
  negativeAnimals: number;
  cullingReviewCount: number;
  totalEstimatedRevenue: number;
  totalEstimatedCost: number;
  totalEstimatedNet: number;
  avgRoiPercent?: number | null;
  items: HerdProfitabilityItemResponse[];
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

export type DeliveryTaskStatus = "PENDING" | "DELIVERED" | "SKIPPED";

export type DeliveryTaskResponse = {
  deliveryTaskId: string;
  taskDate: string;
  taskShift?: Shift | null;
  preferredTime?: string | null;
  optimizedStopOrder?: number | null;
  plannedEta?: string | null;
  slaDueTime?: string | null;
  slaBreached?: boolean | null;
  slaDelayMinutes?: number | null;
  optimizedAt?: string | null;
  customerId?: string | null;
  customerName: string;
  assignedToUsername?: string | null;
  assignedByUsername?: string | null;
  assignedAt?: string | null;
  routeName?: string | null;
  productType?: ProductType;
  plannedQtyLiters: number;
  unitPrice: number;
  paymentMode: PaymentMode;
  deliveredQtyLiters?: number | null;
  status: DeliveryTaskStatus;
  autoGenerated: boolean;
  sourceRefId?: string | null;
  saleId?: string | null;
  saleRecordedAt?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  completedBy?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateDeliveryTaskPayload = {
  taskDate: string;
  taskShift?: Shift | null;
  preferredTime?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  productType?: ProductType | null;
  assignedToUsername?: string | null;
  plannedQtyLiters: number;
  unitPrice?: number | null;
  paymentMode?: PaymentMode | null;
  notes?: string | null;
};

export type AddDeliveryTaskAddonPayload = {
  taskDate: string;
  taskShift: Shift;
  preferredTime?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  productType: ProductType;
  quantity: number;
  unitPrice?: number | null;
  paymentMode?: PaymentMode | null;
  notes?: string | null;
};

export type UpdateDeliveryTaskStatusPayload = {
  status?: DeliveryTaskStatus;
  deliveredQtyLiters?: number | null;
  collectedAmount?: number | null;
  overrideWithdrawalLock?: boolean | null;
  overrideReason?: string | null;
  notes?: string | null;
};

export type UpdateDeliveryTaskStatusBulkItemPayload = {
  deliveryTaskId: string;
  status: DeliveryTaskStatus;
  deliveredQtyLiters?: number | null;
  collectedAmount?: number | null;
  overrideWithdrawalLock?: boolean | null;
  overrideReason?: string | null;
  notes?: string | null;
};

export type UpdateDeliveryTaskStatusBulkPayload = {
  items: UpdateDeliveryTaskStatusBulkItemPayload[];
};

export type UpdateDeliveryTaskStatusBulkItemResponse = {
  deliveryTaskId?: string | null;
  success: boolean;
  errorMessage?: string | null;
  task?: DeliveryTaskResponse | null;
};

export type UpdateDeliveryTaskStatusBulkResponse = {
  totalCount: number;
  successCount: number;
  failedCount: number;
  items: UpdateDeliveryTaskStatusBulkItemResponse[];
};

export type AssignDeliveryTaskPayload = {
  assignedToUsername?: string | null;
  notes?: string | null;
};

export type DeliveryReconciliationRowResponse = {
  date: string;
  deliveryUsername: string;
  assignedTasks: number;
  deliveredTasks: number;
  skippedTasks: number;
  pendingTasks: number;
  plannedQty: number;
  deliveredQty: number;
  collectedAmount: number;
  pendingAmount: number;
  onTimeDeliveredTasks: number;
  slaBreachedDeliveredTasks: number;
  avgDelayMinutesForDelivered: number;
};

export type DeliveryRunClosureResponse = {
  runClosureId: string;
  date: string;
  routeName: string;
  shift: Shift;
  totalStops: number;
  deliveredStops: number;
  pendingStops: number;
  skippedStops: number;
  expectedCollection: number;
  actualCollection: number;
  variance: number;
  cashCollection: number;
  upiCollection: number;
  otherCollection: number;
  notes?: string | null;
  closedBy: string;
  closedAt: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SubscriptionGenerationPreviewItemResponse = {
  source: string;
  date: string;
  customerId: string;
  customerName: string;
  routeName?: string | null;
  subscriptionLineId?: string | null;
  shift: Shift;
  productType: ProductType;
  quantity: number;
  unitPrice: number;
  activeDaysCsv?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  eligible: boolean;
  reason?: string | null;
};

export type SubscriptionGenerationPreviewResponse = {
  date: string;
  totalCandidates: number;
  eligibleCandidates: number;
  skippedCandidates: number;
  items: SubscriptionGenerationPreviewItemResponse[];
};

export type DeliveryDayPlanTriggerResponse = {
  date: string;
  generatedTasks: number;
  eligibleCandidates: number;
  alreadyPlannedCandidates: number;
  blockedCandidates: number;
  autoAssignedTasks: number;
  optimizedTasks: number;
  optimizedRoutes: number;
  totalTasks: number;
  pendingTasks: number;
  unassignedPendingTasks: number;
  actor: string;
};

export type DeliveryRouteOptimizationResponse = {
  date: string;
  shift?: Shift | null;
  routeName?: string | null;
  optimizedTasks: number;
  optimizedRoutes: number;
  pendingTasksInScope: number;
  deliveredTasksInScope: number;
  actor: string;
  optimizedAt?: string | null;
};

export type RecordDeliveryRunClosurePayload = {
  date: string;
  routeName: string;
  shift: Shift;
  totalStops: number;
  deliveredStops: number;
  pendingStops: number;
  skippedStops: number;
  expectedCollection: number;
  actualCollection: number;
  cashCollection?: number | null;
  upiCollection?: number | null;
  otherCollection?: number | null;
  notes?: string | null;
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
  subscriptionPausedUntil?: string | null;
  subscriptionSkipDatesCsv?: string | null;
  subscriptionHolidayWeekdaysCsv?: string | null;
  runningBalance: number;
  totalPaid: number;
  lastPayoutDate?: string | null;
  defaultMilkUnitPrice?: number | null;
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
  subscriptionPausedUntil?: string | null;
  subscriptionSkipDatesCsv?: string | null;
  subscriptionHolidayWeekdaysCsv?: string | null;
  defaultMilkUnitPrice?: number | null;
  isActive?: boolean;
  notes?: string | null;
};

export type UpdateCustomerRecordPayload = CreateCustomerRecordPayload;

export type RecordCustomerPayoutPayload = {
  amount: number;
  payoutDate?: string | null;
  note?: string | null;
};

export type CustomerSubscriptionLineResponse = {
  subscriptionLineId: string;
  customerId: string;
  taskShift: Shift;
  productType: ProductType;
  quantity: number;
  unitPrice: number;
  preferredTime?: string | null;
  activeDaysCsv?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  active: boolean;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateCustomerSubscriptionLinePayload = {
  taskShift: Shift;
  productType: ProductType;
  quantity: number;
  unitPrice: number;
  preferredTime?: string | null;
  activeDaysCsv?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  active?: boolean;
  notes?: string | null;
};

export type UpdateCustomerSubscriptionLinePayload = {
  taskShift: Shift;
  productType: ProductType;
  quantity: number;
  unitPrice: number;
  preferredTime?: string | null;
  activeDaysCsv?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  active: boolean;
  notes?: string | null;
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

export type CustomerSubscriptionStatementDailyRowResponse = {
  date: string;
  dayOfWeek: string;
  status: string;
  expectedQty: number;
  expectedAmount: number;
  billedQty: number;
  billedAmount: number;
  varianceQty: number;
  varianceAmount: number;
};

export type CustomerSubscriptionStatementResponse = {
  customerId: string;
  customerName: string;
  month: string;
  dateFrom: string;
  dateTo: string;
  subscriptionActive: boolean;
  pricingMode: string;
  cycleDays: number;
  baselinePlanDays: number;
  activePlanDays: number;
  pausedDays: number;
  skipDays: number;
  holidayWeekdayDays: number;
  billedDays: number;
  prorationFactor: number;
  baselinePlanQty: number;
  baselinePlanAmount: number;
  plannedQty: number;
  plannedAmount: number;
  holidayCreditAmount: number;
  billedQty: number;
  billedAmount: number;
  receivedAmount: number;
  pendingAmount: number;
  expectedVsBilledVariance: number;
  currentRunningBalance: number;
  totalPaidToDate: number;
  dailyRows: CustomerSubscriptionStatementDailyRowResponse[];
};

export type CustomerSubscriptionInvoiceLineItemResponse = {
  code: string;
  label: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  note?: string | null;
};

export type CustomerSubscriptionInvoiceResponse = {
  customerId: string;
  customerName: string;
  customerType: CustomerType;
  routeName?: string | null;
  collectionPoint?: string | null;
  month: string;
  dateFrom: string;
  dateTo: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: "DRAFT" | "FINALIZED" | "POSTED";
  statusNote?: string | null;
  lastStatusUpdatedAt?: string | null;
  lastStatusUpdatedBy?: string | null;
  finalizedAt?: string | null;
  finalizedBy?: string | null;
  postedAt?: string | null;
  postedBy?: string | null;
  subscriptionActive: boolean;
  pricingMode: string;
  prorationFactor: number;
  cycleDays: number;
  activePlanDays: number;
  pausedDays: number;
  skipDays: number;
  billedDays: number;
  plannedQty: number;
  plannedAmount: number;
  holidayCreditAmount: number;
  billedQty: number;
  billedAmount: number;
  receivedAmount: number;
  pendingAmount: number;
  addOnBilledAmount: number;
  underDeliveryCreditAmount: number;
  openingPendingAmount: number;
  closingPendingAmount: number;
  currentRunningBalance: number;
  invoiceLineItems: CustomerSubscriptionInvoiceLineItemResponse[];
  dailyRows: CustomerSubscriptionStatementDailyRowResponse[];
};

export type CustomerSubscriptionInvoiceSummaryResponse = {
  customerId: string;
  customerName: string;
  customerType: CustomerType;
  routeName?: string | null;
  month: string;
  invoiceNumber: string;
  status: "DRAFT" | "FINALIZED" | "POSTED";
  lastStatusUpdatedAt?: string | null;
  issueDate: string;
  dueDate: string;
  plannedAmount: number;
  holidayCreditAmount: number;
  billedAmount: number;
  receivedAmount: number;
  pendingAmount: number;
  openingPendingAmount: number;
  closingPendingAmount: number;
  addOnBilledAmount: number;
  underDeliveryCreditAmount: number;
  prorationFactor: number;
};

export type CustomerSubscriptionStatementSummaryResponse = {
  customerId: string;
  customerName: string;
  customerType: CustomerType;
  routeName?: string | null;
  month: string;
  pricingMode: string;
  prorationFactor: number;
  activePlanDays: number;
  pausedDays: number;
  skipDays: number;
  holidayWeekdayDays: number;
  billedDays: number;
  plannedAmount: number;
  billedAmount: number;
  receivedAmount: number;
  pendingAmount: number;
  expectedVsBilledVariance: number;
  currentRunningBalance: number;
};

export type UpdateSubscriptionInvoiceStatusPayload = {
  customerId: string;
  month: string;
  note?: string | null;
  overrideReason?: string | null;
};

export type SubscriptionInvoiceStatusUpdateResponse = {
  customerId: string;
  month: string;
  invoiceNumber: string;
  previousStatus: "DRAFT" | "FINALIZED" | "POSTED";
  currentStatus: "DRAFT" | "FINALIZED" | "POSTED";
  statusNote?: string | null;
  updatedAt: string;
  updatedBy: string;
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

export type MonthCloseSettlementRequest = {
  dateFrom: string;
  dateTo: string;
  customerType: CustomerType;
  customerId?: string | null;
  customerName: string;
  payoutAmount?: number | null;
  reconcileOpenCooperative?: boolean;
  note?: string | null;
};

export type MonthCloseSettlementResponse = {
  dateFrom: string;
  dateTo: string;
  customerType: CustomerType;
  customerId?: string | null;
  customerName: string;
  reconciliationApplied: boolean;
  reconciledSales: number;
  payoutRecorded: number;
  customerBalanceAfter?: number | null;
  closedBy: string;
  closedAt: string;
  note?: string | null;
};

export type MonthCloseSettlementBulkItemRequest = {
  customerType: CustomerType;
  customerId?: string | null;
  customerName: string;
  payoutAmount?: number | null;
  reconcileOpenCooperative?: boolean;
};

export type MonthCloseSettlementBulkRequest = {
  dateFrom: string;
  dateTo: string;
  note?: string | null;
  items: MonthCloseSettlementBulkItemRequest[];
};

export type MonthCloseSettlementBulkItemResponse = {
  customerType?: CustomerType;
  customerId?: string | null;
  customerName?: string | null;
  success: boolean;
  message?: string | null;
  reconciliationApplied: boolean;
  reconciledSales: number;
  payoutRecorded: number;
  customerBalanceAfter?: number | null;
};

export type MonthCloseSettlementBulkResponse = {
  dateFrom: string;
  dateTo: string;
  requestedCount: number;
  succeededCount: number;
  failedCount: number;
  processedBy: string;
  processedAt: string;
  note?: string | null;
  results: MonthCloseSettlementBulkItemResponse[];
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
  assignedToUsername?: string | null;
  assignedByUsername?: string | null;
  assignedAt?: string | null;
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
  assignedToUsername?: string | null;
  priority?: FeedSopTaskPriority;
  dueTime?: string | null;
};

export type UpdateFeedSopTaskPayload = {
  taskDate: string;
  title: string;
  details?: string | null;
  assignedRole: UserRole;
  assignedToUsername?: string | null;
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

export type FeedInventoryForecastItemResponse = {
  feedMaterialId: string;
  materialName: string;
  category: FeedMaterialCategory;
  unit: FeedMaterialUnit;
  availableQty: number;
  reorderLevelQty: number;
  costPerUnit?: number | null;
  lowStock: boolean;
  estimatedDailyConsumptionQty: number;
  daysOfStockLeft?: number | null;
  requiredQty30Days: number;
  requiredQty90Days: number;
  recommendedReorderQty30Days: number;
  recommendedReorderQty90Days: number;
  projectedStockAfter30Days: number;
  projectedStockAfter90Days: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  recommendation: string;
  forecastBasis: "LOG_BASED" | "REORDER_LEVEL_ONLY";
};

export type FeedInventoryForecastResponse = {
  date: string;
  lookbackDays: number;
  feedLogsCount: number;
  estimatedDailyConsumptionTotalKg: number;
  highRiskMaterials: number;
  mediumRiskMaterials: number;
  lowRiskMaterials: number;
  totalRecommendedReorderQty30Days: number;
  totalRecommendedReorderQty90Days: number;
  totalRecommendedReorderCost30Days: number;
  totalRecommendedReorderCost90Days: number;
  items: FeedInventoryForecastItemResponse[];
};

export type ProcessingStockStage = "MILK" | "CURD" | "BUTTERMILK" | "GHEE";
export type ProcessingStockTxnType =
  | "AUTO_MILK_PRODUCTION"
  | "AUTO_SALE_DEDUCTION"
  | "AUTO_EOD_MILK_TO_CURD"
  | "MANUAL_CONVERSION"
  | "MANUAL_ADJUSTMENT";

export type ProcessingStockSummaryResponse = {
  date: string;
  rawMaterialItems: number;
  lowStockRawMaterials: number;
  rawMaterialStockValue: number;
  milkBalanceLiters: number;
  curdBalanceKg: number;
  buttermilkBalanceLiters: number;
  gheeBalanceKg: number;
  milkProducedToday: number;
  milkSoldToday: number;
  curdSoldToday: number;
  buttermilkSoldToday: number;
  gheeSoldToday: number;
  suggestedEodMilkToCurd: number;
  transactionsToday: number;
};

export type ProcessingStockTxnResponse = {
  stockTxnId: string;
  txnDate: string;
  txnType: ProcessingStockTxnType;
  sourceKey?: string | null;
  fromStage?: ProcessingStockStage | null;
  inputQty?: number | null;
  toStage?: ProcessingStockStage | null;
  outputQty?: number | null;
  notes?: string | null;
  actorUsername?: string | null;
  createdAt?: string;
};

export type SyncProcessingDayPayload = {
  date?: string | null;
  autoTransferMilkToCurd?: boolean;
};

export type CreateProcessingConversionPayload = {
  date?: string | null;
  fromStage: ProcessingStockStage;
  toStage: ProcessingStockStage;
  inputQty: number;
  outputQty: number;
  notes?: string | null;
};

export type AdjustProcessingStockPayload = {
  date?: string | null;
  stage: ProcessingStockStage;
  quantityDelta: number;
  notes?: string | null;
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

export type HealthProtocolItemResponse = {
  protocolId: string;
  code: string;
  category: string;
  title: string;
  description?: string | null;
  priority: WorklistPriority;
  dueStatus: WorklistDueStatus;
  dueDate?: string | null;
};

export type HealthProtocolResponse = {
  date: string;
  windowDays: number;
  animalId: string;
  animalTag: string;
  animalStatus: AnimalStatus;
  growthStage?: AnimalGrowthStage | null;
  ageDays?: number | null;
  ageMonths?: number | null;
  totalItems: number;
  highPriorityCount: number;
  mediumPriorityCount: number;
  lowPriorityCount: number;
  items: HealthProtocolItemResponse[];
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

export type GenericTaskType = "FEED" | "DELIVERY" | "FARM" | "OTHER";
export type GenericTaskPriority = "LOW" | "MEDIUM" | "HIGH";
export type GenericTaskStatus = "PENDING" | "IN_PROGRESS" | "DONE" | "SKIPPED";

export type GenericTaskResponse = {
  taskId: string;
  taskDate: string;
  taskType: GenericTaskType;
  title: string;
  details?: string | null;
  assignedRole: UserRole;
  assignedToUsername?: string | null;
  assignedByUsername?: string | null;
  assignedAt?: string | null;
  priority: GenericTaskPriority;
  status: GenericTaskStatus;
  dueTime?: string | null;
  sourceRefId?: string | null;
  completedAt?: string | null;
  completedBy?: string | null;
  reminderSentAt?: string | null;
  escalatedAt?: string | null;
  escalationCount?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateGenericTaskPayload = {
  taskDate: string;
  taskType?: GenericTaskType;
  title: string;
  details?: string | null;
  assignedRole?: UserRole;
  assignedToUsername?: string | null;
  priority?: GenericTaskPriority;
  dueTime?: string | null;
  sourceRefId?: string | null;
};

export type UpdateGenericTaskPayload = {
  taskDate: string;
  taskType: GenericTaskType;
  title: string;
  details?: string | null;
  assignedRole: UserRole;
  assignedToUsername?: string | null;
  priority: GenericTaskPriority;
  status: GenericTaskStatus;
  dueTime?: string | null;
  sourceRefId?: string | null;
};

export type GenericTaskTemplateFrequency = "DAILY" | "WEEKLY";

export type GenericTaskTemplateResponse = {
  taskTemplateId: string;
  title: string;
  details?: string | null;
  taskType: GenericTaskType;
  assignedRole: UserRole;
  assignedToUsername?: string | null;
  priority: GenericTaskPriority;
  dueTime?: string | null;
  frequency: GenericTaskTemplateFrequency;
  daysOfWeek: string[];
  startDate: string;
  endDate?: string | null;
  active: boolean;
  reminderLeadMinutes?: number | null;
  reminderRepeatMinutes?: number | null;
  escalationDelayMinutes?: number | null;
  escalateToRole?: UserRole | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateGenericTaskTemplatePayload = {
  title: string;
  details?: string | null;
  taskType?: GenericTaskType;
  assignedRole?: UserRole;
  assignedToUsername?: string | null;
  priority?: GenericTaskPriority;
  dueTime?: string | null;
  frequency?: GenericTaskTemplateFrequency;
  daysOfWeek?: string[];
  startDate?: string | null;
  endDate?: string | null;
  active?: boolean;
  reminderLeadMinutes?: number | null;
  reminderRepeatMinutes?: number | null;
  escalationDelayMinutes?: number | null;
  escalateToRole?: UserRole | null;
};

export type UpdateGenericTaskTemplatePayload = CreateGenericTaskTemplatePayload;

export type TaskAutomationReminderResponse = {
  taskId: string;
  taskDate: string;
  title: string;
  taskType: GenericTaskType;
  status: GenericTaskStatus;
  priority: GenericTaskPriority;
  dueTime?: string | null;
  assignedRole: UserRole;
  assignedToUsername?: string | null;
  message: string;
  reminderAt: string;
};

export type TaskAutomationRunResponse = {
  date: string;
  executedAt: string;
  processedTemplates: number;
  generatedTasks: number;
  updatedTasks: number;
  escalatedTasks: number;
  remindersTriggered: number;
  reminders: TaskAutomationReminderResponse[];
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

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(
          new Error(`Request timed out. Check API URL/network. Current BASE_URL: ${API_BASE_URL}`)
        );
      }, REQUEST_TIMEOUT_MS);
    });

    const response = await Promise.race([
      fetch(url, {
        ...options,
        signal: controller.signal,
      }),
      timeoutPromise,
    ]);

    return response as Response;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error(`Request timed out. Check API URL/network. Current BASE_URL: ${API_BASE_URL}`);
    }
    throw e;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
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

  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      headers,
      ...options,
    });
  } catch (e) {
    throw e;
  }

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

async function httpText(url: string, options?: RequestInit): Promise<string> {
  const headers = new Headers(options?.headers);
  if (AUTH_TOKEN) {
    headers.set("Authorization", `Bearer ${AUTH_TOKEN}`);
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      headers,
      ...options,
    });
  } catch (e) {
    throw e;
  }

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return text;
}

export const MilkApi = {
  getBatch: (date: string, shift: Shift) =>
    http<MilkBatchResponse | null>(
      `${API_BASE_URL}/api/milk-batches?date=${date}&shift=${shift}`
    ),

  getQcEvaluation: (date: string, shift: Shift) =>
    http<MilkBatchQcEvaluationResponse>(
      `${API_BASE_URL}/api/milk-batches/qc-evaluation?date=${date}&shift=${shift}`
    ),

  listQcOverrides: (dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (dateFrom) {
      params.set("dateFrom", dateFrom);
    }
    if (dateTo) {
      params.set("dateTo", dateTo);
    }
    const query = params.toString();
    return http<MilkQcOverrideAuditResponse[]>(
      `${API_BASE_URL}/api/milk-batches/qc-overrides${query ? `?${query}` : ""}`
    );
  },

  saveBatch: (payload: { date: string; shift: Shift; totalLiters: number }) =>
    http<MilkBatchResponse>(`${API_BASE_URL}/api/milk-batches`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateQc: (payload: {
    date: string;
    shift: Shift;
    qcStatus: QcStatus;
    overrideRecommendedStatus?: boolean | null;
    overrideReason?: string | null;
  }) =>
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

  byTag: (tag: string) =>
    http<AnimalResponse>(`${API_BASE_URL}/api/animals/by-tag?tag=${encodeURIComponent(tag)}`),

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

  listAttendance: (params?: {
    date?: string;
    shift?: Shift;
    employeeId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) => {
    const search = new URLSearchParams();
    if (params?.date) {
      search.set("date", params.date);
    }
    if (params?.shift) {
      search.set("shift", params.shift);
    }
    if (params?.employeeId) {
      search.set("employeeId", params.employeeId);
    }
    if (params?.dateFrom) {
      search.set("dateFrom", params.dateFrom);
    }
    if (params?.dateTo) {
      search.set("dateTo", params.dateTo);
    }
    const query = search.toString();
    return http<EmployeeAttendanceResponse[]>(
      `${API_BASE_URL}/api/employees/attendance${query ? `?${query}` : ""}`
    );
  },

  upsertAttendance: (payload: UpsertEmployeeAttendancePayload) =>
    http<EmployeeAttendanceResponse>(`${API_BASE_URL}/api/employees/attendance`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  bulkUpsertAttendance: (payload: BulkUpsertEmployeeAttendancePayload) =>
    http<EmployeeAttendanceResponse[]>(`${API_BASE_URL}/api/employees/attendance/bulk`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  monthlyAttendance: (params: EmployeeAttendanceMonthlyReportParams) => {
    const search = new URLSearchParams();
    search.set("month", params.month);
    if (params.includeInactive !== undefined) {
      search.set("includeInactive", String(params.includeInactive));
    }
    if (params.includeAdjustments !== undefined) {
      search.set("includeAdjustments", String(params.includeAdjustments));
    }
    if (params.salaryMode) {
      search.set("salaryMode", params.salaryMode);
    }
    if (params.fullTimeDailyRate != null) {
      search.set("fullTimeDailyRate", String(params.fullTimeDailyRate));
    }
    if (params.partTimeDailyRate != null) {
      search.set("partTimeDailyRate", String(params.partTimeDailyRate));
    }
    if (params.fullTimeShiftRate != null) {
      search.set("fullTimeShiftRate", String(params.fullTimeShiftRate));
    }
    if (params.partTimeShiftRate != null) {
      search.set("partTimeShiftRate", String(params.partTimeShiftRate));
    }
    if (params.hourlyRate != null) {
      search.set("hourlyRate", String(params.hourlyRate));
    }
    if (params.overtimeHourlyRate != null) {
      search.set("overtimeHourlyRate", String(params.overtimeHourlyRate));
    }
    if (params.standardHoursPerDay != null) {
      search.set("standardHoursPerDay", String(params.standardHoursPerDay));
    }
    return http<EmployeeAttendanceMonthlyReportResponse>(
      `${API_BASE_URL}/api/employees/attendance/monthly?${search.toString()}`
    );
  },

  exportMonthlyAttendanceCsv: (params: EmployeeAttendanceMonthlyReportParams) => {
    const search = new URLSearchParams();
    search.set("month", params.month);
    if (params.includeInactive !== undefined) {
      search.set("includeInactive", String(params.includeInactive));
    }
    if (params.includeAdjustments !== undefined) {
      search.set("includeAdjustments", String(params.includeAdjustments));
    }
    if (params.salaryMode) {
      search.set("salaryMode", params.salaryMode);
    }
    if (params.fullTimeDailyRate != null) {
      search.set("fullTimeDailyRate", String(params.fullTimeDailyRate));
    }
    if (params.partTimeDailyRate != null) {
      search.set("partTimeDailyRate", String(params.partTimeDailyRate));
    }
    if (params.fullTimeShiftRate != null) {
      search.set("fullTimeShiftRate", String(params.fullTimeShiftRate));
    }
    if (params.partTimeShiftRate != null) {
      search.set("partTimeShiftRate", String(params.partTimeShiftRate));
    }
    if (params.hourlyRate != null) {
      search.set("hourlyRate", String(params.hourlyRate));
    }
    if (params.overtimeHourlyRate != null) {
      search.set("overtimeHourlyRate", String(params.overtimeHourlyRate));
    }
    if (params.standardHoursPerDay != null) {
      search.set("standardHoursPerDay", String(params.standardHoursPerDay));
    }
    return httpText(`${API_BASE_URL}/api/employees/attendance/monthly/export?${search.toString()}`, {
      headers: {
        Accept: "text/csv",
      },
    });
  },

  listCompAdjustments: (params: { month: string; employeeId?: string }) => {
    const search = new URLSearchParams();
    search.set("month", params.month);
    if (params.employeeId) {
      search.set("employeeId", params.employeeId);
    }
    return http<EmployeeCompensationAdjustmentResponse[]>(
      `${API_BASE_URL}/api/employees/attendance/adjustments?${search.toString()}`
    );
  },

  createCompAdjustment: (payload: CreateEmployeeCompensationAdjustmentPayload) =>
    http<EmployeeCompensationAdjustmentResponse>(`${API_BASE_URL}/api/employees/attendance/adjustments`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  deleteCompAdjustment: (adjustmentId: string) =>
    http<void>(`${API_BASE_URL}/api/employees/attendance/adjustments/${encodeURIComponent(adjustmentId)}`, {
      method: "DELETE",
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

  listAssignableUsers: (roles?: UserRole[]) => {
    const search = new URLSearchParams();
    (roles ?? []).forEach((role) => search.append("roles", role));
    const query = search.toString();
    return http<AuthUserResponse[]>(
      `${API_BASE_URL}/api/auth/users/assignable${query ? `?${query}` : ""}`
    );
  },

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

  animalProfitability: (animalId: string, toDate: string, days = 30) =>
    http<AnimalProfitabilityResponse>(
      `${API_BASE_URL}/api/reports/animals/${encodeURIComponent(animalId)}/profitability?toDate=${encodeURIComponent(
        toDate
      )}&days=${days}`
    ),

  herdProfitability: (params?: {
    toDate?: string;
    days?: number;
    activeOnly?: boolean;
    status?: AnimalStatus;
    limit?: number;
  }) => {
    const search = new URLSearchParams();
    if (params?.toDate) search.set("toDate", params.toDate);
    if (params?.days != null) search.set("days", String(params.days));
    if (params?.activeOnly != null) search.set("activeOnly", String(params.activeOnly));
    if (params?.status) search.set("status", params.status);
    if (params?.limit != null) search.set("limit", String(params.limit));
    const query = search.toString();
    return http<HerdProfitabilityResponse>(`${API_BASE_URL}/api/reports/animals/profitability${query ? `?${query}` : ""}`);
  },
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

  subscriptionStatement: (params: {
    customerId: string;
    month?: string;
    includeDaily?: boolean;
  }) => {
    const search = new URLSearchParams();
    search.set("customerId", params.customerId);
    if (params.month) search.set("month", params.month);
    if (params.includeDaily !== undefined) search.set("includeDaily", String(params.includeDaily));
    return http<CustomerSubscriptionStatementResponse>(
      `${API_BASE_URL}/api/sales/subscription-statement?${search.toString()}`
    );
  },

  subscriptionInvoice: (params: {
    customerId: string;
    month?: string;
    includeDaily?: boolean;
  }) => {
    const search = new URLSearchParams();
    search.set("customerId", params.customerId);
    if (params.month) search.set("month", params.month);
    if (params.includeDaily !== undefined) search.set("includeDaily", String(params.includeDaily));
    return http<CustomerSubscriptionInvoiceResponse>(
      `${API_BASE_URL}/api/sales/subscription-invoice?${search.toString()}`
    );
  },

  subscriptionInvoices: (params?: {
    month?: string;
    customerType?: CustomerType;
  }) => {
    const search = new URLSearchParams();
    if (params?.month) search.set("month", params.month);
    if (params?.customerType) search.set("customerType", params.customerType);
    const query = search.toString();
    return http<CustomerSubscriptionInvoiceSummaryResponse[]>(
      `${API_BASE_URL}/api/sales/subscription-invoices${query ? `?${query}` : ""}`
    );
  },

  subscriptionStatements: (params?: {
    month?: string;
    customerType?: CustomerType;
  }) => {
    const search = new URLSearchParams();
    if (params?.month) search.set("month", params.month);
    if (params?.customerType) search.set("customerType", params.customerType);
    const query = search.toString();
    return http<CustomerSubscriptionStatementSummaryResponse[]>(
      `${API_BASE_URL}/api/sales/subscription-statements${query ? `?${query}` : ""}`
    );
  },

  exportSubscriptionStatementsCsv: (params?: {
    month?: string;
    customerType?: CustomerType;
  }) => {
    const search = new URLSearchParams();
    if (params?.month) search.set("month", params.month);
    if (params?.customerType) search.set("customerType", params.customerType);
    const query = search.toString();
    return httpText(`${API_BASE_URL}/api/sales/subscription-statements/export${query ? `?${query}` : ""}`, {
      headers: {
        Accept: "text/csv",
      },
    });
  },

  finalizeSubscriptionInvoice: (payload: UpdateSubscriptionInvoiceStatusPayload) =>
    http<SubscriptionInvoiceStatusUpdateResponse>(`${API_BASE_URL}/api/sales/subscription-invoice/finalize`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  postSubscriptionInvoice: (payload: UpdateSubscriptionInvoiceStatusPayload) =>
    http<SubscriptionInvoiceStatusUpdateResponse>(`${API_BASE_URL}/api/sales/subscription-invoice/post`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  reopenSubscriptionInvoice: (payload: UpdateSubscriptionInvoiceStatusPayload) =>
    http<SubscriptionInvoiceStatusUpdateResponse>(`${API_BASE_URL}/api/sales/subscription-invoice/reopen`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

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

  monthClose: (payload: MonthCloseSettlementRequest) =>
    http<MonthCloseSettlementResponse>(`${API_BASE_URL}/api/sales/month-close`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  monthCloseBulk: (payload: MonthCloseSettlementBulkRequest) =>
    http<MonthCloseSettlementBulkResponse>(`${API_BASE_URL}/api/sales/month-close/bulk`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  monthCloseBulkPreview: (payload: MonthCloseSettlementBulkRequest) =>
    http<MonthCloseSettlementBulkResponse>(`${API_BASE_URL}/api/sales/month-close/bulk/preview`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  deliveryList: (date: string) =>
    http<DeliveryChecklistItemResponse[]>(`${API_BASE_URL}/api/sales/delivery-list?date=${date}`),

  updateDelivery: (
    saleId: string,
    payload: {
      delivered: boolean;
      deliveryNote?: string | null;
      collectedAmount?: number | null;
      overrideWithdrawalLock?: boolean | null;
      overrideReason?: string | null;
    }
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

  listSubscriptionLines: (customerId: string, activeOnly?: boolean) =>
    http<CustomerSubscriptionLineResponse[]>(
      `${API_BASE_URL}/api/customers/${encodeURIComponent(customerId)}/subscription-lines${
        activeOnly === undefined ? "" : `?activeOnly=${activeOnly}`
      }`
    ),

  createSubscriptionLine: (customerId: string, payload: CreateCustomerSubscriptionLinePayload) =>
    http<CustomerSubscriptionLineResponse>(
      `${API_BASE_URL}/api/customers/${encodeURIComponent(customerId)}/subscription-lines`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ),

  updateSubscriptionLine: (
    customerId: string,
    subscriptionLineId: string,
    payload: UpdateCustomerSubscriptionLinePayload
  ) =>
    http<CustomerSubscriptionLineResponse>(
      `${API_BASE_URL}/api/customers/${encodeURIComponent(
        customerId
      )}/subscription-lines/${encodeURIComponent(subscriptionLineId)}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      }
    ),

  deleteSubscriptionLine: (customerId: string, subscriptionLineId: string) =>
    http<void>(
      `${API_BASE_URL}/api/customers/${encodeURIComponent(
        customerId
      )}/subscription-lines/${encodeURIComponent(subscriptionLineId)}`,
      {
        method: "DELETE",
      }
    ),
};

export const DeliveryTaskApi = {
  list: (params?: { date?: string; status?: DeliveryTaskStatus }) => {
    const search = new URLSearchParams();
    if (params?.date) search.set("date", params.date);
    if (params?.status) search.set("status", params.status);
    const query = search.toString();
    return http<DeliveryTaskResponse[]>(`${API_BASE_URL}/api/delivery-tasks${query ? `?${query}` : ""}`);
  },

  create: (payload: CreateDeliveryTaskPayload) =>
    http<DeliveryTaskResponse>(`${API_BASE_URL}/api/delivery-tasks`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  addOn: (payload: AddDeliveryTaskAddonPayload) =>
    http<DeliveryTaskResponse>(`${API_BASE_URL}/api/delivery-tasks/add-on`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  generateSubscriptions: (date: string) =>
    http<DeliveryTaskResponse[]>(
      `${API_BASE_URL}/api/delivery-tasks/generate-subscriptions?date=${encodeURIComponent(date)}`,
      {
        method: "POST",
      }
    ),

  triggerDayPlan: (date: string, autoAssign = true, optimize = true) =>
    http<DeliveryDayPlanTriggerResponse>(
      `${API_BASE_URL}/api/delivery-tasks/day-plan?date=${encodeURIComponent(date)}&autoAssign=${autoAssign}&optimize=${optimize}`,
      {
        method: "POST",
      }
    ),

  optimize: (params: { date: string; shift?: Shift | null; routeName?: string | null }) => {
    const search = new URLSearchParams();
    search.set("date", params.date);
    if (params.shift) search.set("shift", params.shift);
    if (params.routeName) search.set("routeName", params.routeName);
    return http<DeliveryRouteOptimizationResponse>(
      `${API_BASE_URL}/api/delivery-tasks/optimize?${search.toString()}`,
      {
        method: "POST",
      }
    );
  },

  previewSubscriptions: (date: string) =>
    http<SubscriptionGenerationPreviewResponse>(
      `${API_BASE_URL}/api/delivery-tasks/generate-subscriptions/preview?date=${encodeURIComponent(date)}`
    ),

  updateStatus: (deliveryTaskId: string, payload: UpdateDeliveryTaskStatusPayload) =>
    http<DeliveryTaskResponse>(`${API_BASE_URL}/api/delivery-tasks/${encodeURIComponent(deliveryTaskId)}/status`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  bulkUpdateStatus: (payload: UpdateDeliveryTaskStatusBulkPayload) =>
    http<UpdateDeliveryTaskStatusBulkResponse>(`${API_BASE_URL}/api/delivery-tasks/bulk-status`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  assign: (deliveryTaskId: string, payload: AssignDeliveryTaskPayload) =>
    http<DeliveryTaskResponse>(`${API_BASE_URL}/api/delivery-tasks/${encodeURIComponent(deliveryTaskId)}/assign`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  recordRunClosure: (payload: RecordDeliveryRunClosurePayload) =>
    http<DeliveryRunClosureResponse>(`${API_BASE_URL}/api/delivery-tasks/run-closures`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listRunClosures: (date: string) =>
    http<DeliveryRunClosureResponse[]>(
      `${API_BASE_URL}/api/delivery-tasks/run-closures?date=${encodeURIComponent(date)}`
    ),

  reconciliation: (date: string) =>
    http<DeliveryReconciliationRowResponse[]>(
      `${API_BASE_URL}/api/delivery-tasks/reconciliation?date=${encodeURIComponent(date)}`
    ),
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

  forecast: (date: string, lookbackDays = 30) =>
    http<FeedInventoryForecastResponse>(
      `${API_BASE_URL}/api/feed-management/forecast?date=${encodeURIComponent(date)}&lookbackDays=${lookbackDays}`
    ),

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

  listTasks: (params?: {
    date?: string;
    status?: FeedSopTaskStatus;
    assignedRole?: UserRole;
    assignedToUsername?: string;
  }) => {
    const search = new URLSearchParams();
    if (params?.date) search.set("date", params.date);
    if (params?.status) search.set("status", params.status);
    if (params?.assignedRole) search.set("assignedRole", params.assignedRole);
    if (params?.assignedToUsername) search.set("assignedToUsername", params.assignedToUsername);
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

export const StockManagerApi = {
  summary: (date: string) =>
    http<ProcessingStockSummaryResponse>(
      `${API_BASE_URL}/api/stock-manager/processing/summary?date=${encodeURIComponent(date)}`
    ),

  listTransactions: (params?: { date?: string }) => {
    const search = new URLSearchParams();
    if (params?.date) search.set("date", params.date);
    const query = search.toString();
    return http<ProcessingStockTxnResponse[]>(
      `${API_BASE_URL}/api/stock-manager/processing/transactions${query ? `?${query}` : ""}`
    );
  },

  syncDay: (payload: SyncProcessingDayPayload) =>
    http<ProcessingStockSummaryResponse>(`${API_BASE_URL}/api/stock-manager/processing/sync-day`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  convert: (payload: CreateProcessingConversionPayload) =>
    http<ProcessingStockTxnResponse>(`${API_BASE_URL}/api/stock-manager/processing/conversion`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  adjust: (payload: AdjustProcessingStockPayload) =>
    http<ProcessingStockTxnResponse>(`${API_BASE_URL}/api/stock-manager/processing/adjustment`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export const TaskApi = {
  list: (params?: {
    date?: string;
    status?: GenericTaskStatus;
    taskType?: GenericTaskType;
    assignedRole?: UserRole;
    assignedToUsername?: string;
  }) => {
    const search = new URLSearchParams();
    if (params?.date) search.set("date", params.date);
    if (params?.status) search.set("status", params.status);
    if (params?.taskType) search.set("taskType", params.taskType);
    if (params?.assignedRole) search.set("assignedRole", params.assignedRole);
    if (params?.assignedToUsername) search.set("assignedToUsername", params.assignedToUsername);
    const query = search.toString();
    return http<GenericTaskResponse[]>(`${API_BASE_URL}/api/tasks${query ? `?${query}` : ""}`);
  },

  create: (payload: CreateGenericTaskPayload) =>
    http<GenericTaskResponse>(`${API_BASE_URL}/api/tasks`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: (taskId: string, payload: UpdateGenericTaskPayload) =>
    http<GenericTaskResponse>(`${API_BASE_URL}/api/tasks/${encodeURIComponent(taskId)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  updateStatus: (taskId: string, payload: { status: GenericTaskStatus }) =>
    http<GenericTaskResponse>(`${API_BASE_URL}/api/tasks/${encodeURIComponent(taskId)}/status`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listTemplates: (activeOnly?: boolean) => {
    const search = new URLSearchParams();
    if (activeOnly !== undefined) search.set("activeOnly", String(activeOnly));
    const query = search.toString();
    return http<GenericTaskTemplateResponse[]>(
      `${API_BASE_URL}/api/task-templates${query ? `?${query}` : ""}`
    );
  },

  createTemplate: (payload: CreateGenericTaskTemplatePayload) =>
    http<GenericTaskTemplateResponse>(`${API_BASE_URL}/api/task-templates`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateTemplate: (taskTemplateId: string, payload: UpdateGenericTaskTemplatePayload) =>
    http<GenericTaskTemplateResponse>(
      `${API_BASE_URL}/api/task-templates/${encodeURIComponent(taskTemplateId)}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      }
    ),

  runAutomation: (date?: string, dryRun = false) => {
    const search = new URLSearchParams();
    if (date) search.set("date", date);
    search.set("dryRun", String(dryRun));
    return http<TaskAutomationRunResponse>(
      `${API_BASE_URL}/api/task-automation/run?${search.toString()}`,
      {
        method: "POST",
      }
    );
  },
};

export const HealthApi = {
  summary: (date: string, windowDays = 7) =>
    http<HealthSummaryResponse>(
      `${API_BASE_URL}/api/health/summary?date=${date}&windowDays=${windowDays}`
    ),

  protocol: (animalId: string, date?: string, windowDays = 7) => {
    const search = new URLSearchParams();
    if (date) search.set("date", date);
    search.set("windowDays", String(windowDays));
    return http<HealthProtocolResponse>(
      `${API_BASE_URL}/api/animals/${encodeURIComponent(animalId)}/health-protocol?${search.toString()}`
    );
  },

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

  uploadQcLab: (payload: UploadFilePayload) => {
    const form = new FormData();
    form.append("file", payload as any);
    return http<UploadFileResponse>(`${API_BASE_URL}/api/uploads/qc-labs`, {
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
