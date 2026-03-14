import { UserRole } from "@/src/services/api";

export type RolePermissions = {
  role: UserRole | null;
  isAdmin: boolean;
  isManager: boolean;
  isWorker: boolean;
  isFeedManager: boolean;
  isDelivery: boolean;
  isVet: boolean;
  canOpsCore: boolean;
  canClinical: boolean;
  canSalesChecklist: boolean;
  canDeliveryOps: boolean;
  canCustomers: boolean;
  canEmployees: boolean;
  canStock: boolean;
  canTaskManager: boolean;
  canWorklist: boolean;
  canManageSales: boolean;
  canDeliveryChecklist: boolean;
  canManageCustomers: boolean;
  canManageHealth: boolean;
  canManageBreeding: boolean;
  canManageTreatments: boolean;
  canApproveQc: boolean;
  canManageEmployees: boolean;
  canManageAttendance: boolean;
  canViewPayrollAdjustments: boolean;
  canManagePayrollAdjustments: boolean;
  canManageExpenses: boolean;
  canAddFeed: boolean;
  canEditFeed: boolean;
  canManageFeedManagement: boolean;
  canUpdateFeedTaskStatus: boolean;
  canManageAllFeedTasks: boolean;
  canManageTasks: boolean;
  canManageAllGenericTasks: boolean;
  canManageTaskAutomation: boolean;
  canViewDeliveryTasks: boolean;
  canManageDeliveryTaskAssignments: boolean;
  canCreateAnimal: boolean;
  canEditAnimal: boolean;
  canCreateDeliveryAddOn: boolean;
};

export function resolveRolePermissions(role?: UserRole | null): RolePermissions {
  const normalizedRole = role ?? null;
  const isAdmin = normalizedRole === "ADMIN";
  const isManager = normalizedRole === "MANAGER";
  const isWorker = normalizedRole === "WORKER";
  const isFeedManager = normalizedRole === "FEED_MANAGER";
  const isDelivery = normalizedRole === "DELIVERY";
  const isVet = normalizedRole === "VET";
  const canOpsCore = isAdmin || isManager || isWorker;
  const canClinical = isAdmin || isManager || isVet;
  const canSalesChecklist = canOpsCore || isDelivery;
  const canDeliveryOps = canOpsCore || isDelivery;
  const canCustomers = canOpsCore || isDelivery;
  const canEmployees = isAdmin || isManager;
  const canStock = isAdmin || isManager || isFeedManager;
  const canTaskManager = isAdmin || isManager || isFeedManager;
  const canWorklist = !isDelivery && !isVet;
  const canManageSales = isAdmin || isManager;
  const canDeliveryChecklist = canOpsCore || isDelivery;
  const canManageCustomers = isAdmin || isManager;
  const canManageHealth = canClinical;
  const canManageBreeding = canClinical;
  const canManageTreatments = canClinical;
  const canApproveQc = isAdmin || isManager;
  const canManageEmployees = isAdmin;
  const canManageAttendance = isAdmin || isManager;
  const canViewPayrollAdjustments = isAdmin || isManager;
  const canManagePayrollAdjustments = isAdmin;
  const canManageExpenses = isAdmin;
  const canAddFeed = isAdmin || isManager || isWorker || isFeedManager;
  const canEditFeed = isAdmin || isManager || isFeedManager;
  const canManageFeedManagement = isAdmin || isManager || isFeedManager;
  const canUpdateFeedTaskStatus = isAdmin || isManager || isWorker || isFeedManager;
  const canManageAllFeedTasks = isAdmin || isManager || isFeedManager;
  const canManageTasks = isAdmin || isManager || isFeedManager;
  const canManageAllGenericTasks = isAdmin || isManager;
  const canManageTaskAutomation = isAdmin || isManager || isFeedManager;
  const canViewDeliveryTasks = isAdmin || isManager || isWorker || isDelivery;
  const canManageDeliveryTaskAssignments = isAdmin || isManager;
  const canCreateAnimal = isAdmin;
  const canEditAnimal = isAdmin || isManager;
  const canCreateDeliveryAddOn = isAdmin || isManager || isDelivery;

  return {
    role: normalizedRole,
    isAdmin,
    isManager,
    isWorker,
    isFeedManager,
    isDelivery,
    isVet,
    canOpsCore,
    canClinical,
    canSalesChecklist,
    canDeliveryOps,
    canCustomers,
    canEmployees,
    canStock,
    canTaskManager,
    canWorklist,
    canManageSales,
    canDeliveryChecklist,
    canManageCustomers,
    canManageHealth,
    canManageBreeding,
    canManageTreatments,
    canApproveQc,
    canManageEmployees,
    canManageAttendance,
    canViewPayrollAdjustments,
    canManagePayrollAdjustments,
    canManageExpenses,
    canAddFeed,
    canEditFeed,
    canManageFeedManagement,
    canUpdateFeedTaskStatus,
    canManageAllFeedTasks,
    canManageTasks,
    canManageAllGenericTasks,
    canManageTaskAutomation,
    canViewDeliveryTasks,
    canManageDeliveryTaskAssignments,
    canCreateAnimal,
    canEditAnimal,
    canCreateDeliveryAddOn,
  };
}
