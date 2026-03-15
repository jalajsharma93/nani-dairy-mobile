import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  AuthApi,
  AuthUserResponse,
  CustomerApi,
  CustomerRecordResponse,
  DeliveryReconciliationRowResponse,
  DeliveryRouteOptimizationResponse,
  DeliveryRunClosureResponse,
  DeliveryTaskApi,
  DeliveryTaskResponse,
  DeliveryTaskStatus,
  MilkApi,
  ProcessingStockSummaryResponse,
  ProductType,
  QcStatus,
  StockManagerApi,
  SubscriptionGenerationPreviewResponse,
  Shift,
  UpdateDeliveryTaskStatusBulkItemPayload,
  UpdateDeliveryTaskStatusPayload,
} from "@/src/services/api";
import { DairyColors } from "@/src/constants/dairy-theme";
import { todayLocalISO } from "@/src/utils/date";
import { DateInput } from "../../../components/date-input";
import {
  flushPendingSyncOperations,
  getPendingSyncSummary,
  PendingSyncSummary,
  queueDeliveryAddOn,
  queueDeliveryTaskStatus,
  shouldQueueForOffline,
} from "@/src/utils/offline-sync";
import { useAuth } from "@/src/state/auth";
import { useI18n } from "@/src/state/i18n";
import { resolveRolePermissions } from "@/src/state/permissions";

function routeKey(routeName?: string | null) {
  const route = routeName?.trim();
  return route && route.length > 0 ? route : "Unassigned Route";
}

function compareTaskOrder(a: DeliveryTaskResponse, b: DeliveryTaskResponse) {
  const stopA = a.optimizedStopOrder ?? Number.MAX_SAFE_INTEGER;
  const stopB = b.optimizedStopOrder ?? Number.MAX_SAFE_INTEGER;
  if (stopA !== stopB) return stopA - stopB;
  const etaA = a.plannedEta ?? "";
  const etaB = b.plannedEta ?? "";
  if (etaA !== etaB) return etaA.localeCompare(etaB);
  const prefA = a.preferredTime ?? "";
  const prefB = b.preferredTime ?? "";
  if (prefA !== prefB) return prefA.localeCompare(prefB);
  return a.customerName.localeCompare(b.customerName);
}

function statusTone(status: DeliveryTaskStatus) {
  if (status === "DELIVERED") {
    return { bg: DairyColors.successSoft, text: DairyColors.success };
  }
  if (status === "SKIPPED") {
    return { bg: DairyColors.warningSoft, text: DairyColors.warning };
  }
  return { bg: DairyColors.infoSoft, text: DairyColors.info };
}

function slaTone(task: DeliveryTaskResponse) {
  if (task.status === "DELIVERED") {
    if (task.slaBreached) {
      return { bg: DairyColors.warningSoft, text: DairyColors.warning };
    }
    return { bg: DairyColors.successSoft, text: DairyColors.success };
  }
  return { bg: DairyColors.infoSoft, text: DairyColors.info };
}

function stockTransferTone(state?: string | null) {
  if (state === "AUTO_TRANSFERRED") {
    return { bg: DairyColors.successSoft, text: DairyColors.success };
  }
  if (state === "READY_FOR_AUTO_TRANSFER") {
    return { bg: DairyColors.warningSoft, text: DairyColors.warning };
  }
  if (state === "NO_PENDING_TRANSFER") {
    return { bg: DairyColors.infoSoft, text: DairyColors.info };
  }
  return { bg: DairyColors.surfaceMuted, text: DairyColors.textSecondary };
}

function taskProductType(task: DeliveryTaskResponse): ProductType {
  return task.productType ?? "MILK";
}

function qcLabel(status: QcStatus | "MISSING") {
  if (status === "MISSING") return "NO_BATCH";
  return status;
}

const ADDON_PRODUCTS: ProductType[] = ["MILK", "CURD", "BUTTERMILK", "PANEER", "GHEE"];

const PREVIEW_REASON_LABELS: Record<string, { en: string; hi: string }> = {
  CUSTOMER_NOT_FOUND_OR_INACTIVE: {
    en: "Customer missing/inactive",
    hi: "ग्राहक नहीं मिला या निष्क्रिय",
  },
  CUSTOMER_INACTIVE: { en: "Customer inactive", hi: "ग्राहक निष्क्रिय" },
  SUBSCRIPTION_NOT_ACTIVE: { en: "Subscription inactive", hi: "सब्सक्रिप्शन निष्क्रिय" },
  BEFORE_START_DATE: { en: "Before subscription start date", hi: "शुरुआती तारीख से पहले" },
  AFTER_END_DATE: { en: "After subscription end date", hi: "समाप्ति तारीख के बाद" },
  PAUSED_UNTIL_DATE: { en: "Subscription paused for date", hi: "तारीख के लिए सब्सक्रिप्शन रुका है" },
  SKIP_DATE: { en: "Marked as skip date", hi: "इस तारीख को स्किप किया गया है" },
  HOLIDAY_WEEKDAY: { en: "Configured weekly holiday", hi: "सेट किया हुआ साप्ताहिक अवकाश" },
  DAY_NOT_IN_ACTIVE_DAYS: { en: "Day not in active days", hi: "दिन सक्रिय दिनों में नहीं है" },
  LINE_QTY_NOT_POSITIVE: { en: "Line quantity is zero/negative", hi: "लाइन मात्रा शून्य/नकारात्मक है" },
  LINE_UNIT_PRICE_NOT_POSITIVE: { en: "Line price is zero/negative", hi: "लाइन कीमत शून्य/नकारात्मक है" },
  LEGACY_QTY_NOT_POSITIVE: { en: "Legacy quantity is zero/negative", hi: "लीगेसी मात्रा शून्य/नकारात्मक है" },
  LEGACY_UNIT_PRICE_NOT_POSITIVE: { en: "Legacy price is zero/negative", hi: "लीगेसी कीमत शून्य/नकारात्मक है" },
  TASK_ALREADY_EXISTS_PENDING: { en: "Task already planned", hi: "टास्क पहले से प्लान है" },
  TASK_ALREADY_EXISTS_DELIVERED: { en: "Task already delivered", hi: "टास्क पहले से डिलीवर है" },
  TASK_ALREADY_EXISTS_SKIPPED: { en: "Task already marked skipped", hi: "टास्क पहले से स्किप है" },
  UNKNOWN: { en: "Unknown reason", hi: "अज्ञात कारण" },
};

function normalizePreviewReason(reason?: string | null) {
  const key = (reason ?? "UNKNOWN").trim().toUpperCase();
  return key.length > 0 ? key : "UNKNOWN";
}

export default function DeliveryOpsScreen() {
  const { user } = useAuth();
  const { x, label } = useI18n();
  const permissions = resolveRolePermissions(user?.role);
  const canAccess = permissions.canDeliveryOps;
  const isPrivileged = permissions.isAdmin || permissions.isManager;
  const canCreateAddOn = permissions.canCreateDeliveryAddOn;
  const canBulkRunActions = permissions.canCreateDeliveryAddOn;
  const canViewTeamReconciliation = isPrivileged;

  const [date, setDate] = useState(todayLocalISO());
  const [shiftFilter, setShiftFilter] = useState<Shift | "ALL">("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [generatingSubscriptions, setGeneratingSubscriptions] = useState(false);
  const [previewingSubscriptions, setPreviewingSubscriptions] = useState(false);
  const [optimizingRoutes, setOptimizingRoutes] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [bulkUpdatingRun, setBulkUpdatingRun] = useState(false);
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null);
  const [assigneePickerTaskId, setAssigneePickerTaskId] = useState<string | null>(null);
  const [closureSaving, setClosureSaving] = useState(false);
  const [tasks, setTasks] = useState<DeliveryTaskResponse[]>([]);
  const [rows, setRows] = useState<DeliveryReconciliationRowResponse[]>([]);
  const [pendingSync, setPendingSync] = useState<PendingSyncSummary>({
    total: 0,
    deliveryTaskStatus: 0,
    deliveryAddOn: 0,
    deliveryTaskCreate: 0,
    genericTaskStatus: 0,
    milkSave: 0,
    qcCowUpdate: 0,
    qcBatchStatusUpdate: 0,
    saleSave: 0,
    saleDeliveryUpdate: 0,
    saleReconcileUpdate: 0,
    expenseSave: 0,
    treatmentSave: 0,
    feedBulkCreate: 0,
    feedLogUpdate: 0,
    deadLetter: 0,
  });
  const [customerOptions, setCustomerOptions] = useState<CustomerRecordResponse[]>([]);
  const [addOnCustomerId, setAddOnCustomerId] = useState<string | null>(null);
  const [addOnCustomerName, setAddOnCustomerName] = useState("");
  const [addOnShift, setAddOnShift] = useState<Shift>("AM");
  const [addOnProductType, setAddOnProductType] = useState<ProductType>("MILK");
  const [addOnQty, setAddOnQty] = useState("");
  const [addOnUnitPrice, setAddOnUnitPrice] = useState("");
  const [addOnPreferredTime, setAddOnPreferredTime] = useState("");
  const [addOnNotes, setAddOnNotes] = useState("");
  const [addOnSaving, setAddOnSaving] = useState(false);
  const [deliveryUsers, setDeliveryUsers] = useState<AuthUserResponse[]>([]);
  const [runRoute, setRunRoute] = useState<string>("");
  const [runShift, setRunShift] = useState<Shift>("AM");
  const [runActive, setRunActive] = useState(false);
  const [runCollectedByTaskId, setRunCollectedByTaskId] = useState<Record<string, string>>({});
  const [runNoteByTaskId, setRunNoteByTaskId] = useState<Record<string, string>>({});
  const [closureCash, setClosureCash] = useState("");
  const [closureUpi, setClosureUpi] = useState("");
  const [closureOther, setClosureOther] = useState("");
  const [closureNotes, setClosureNotes] = useState("");
  const [runClosures, setRunClosures] = useState<DeliveryRunClosureResponse[]>([]);
  const [lastOptimization, setLastOptimization] = useState<DeliveryRouteOptimizationResponse | null>(null);
  const [subscriptionPreview, setSubscriptionPreview] = useState<SubscriptionGenerationPreviewResponse | null>(null);
  const [stockSummary, setStockSummary] = useState<ProcessingStockSummaryResponse | null>(null);
  const [qcByShift, setQcByShift] = useState<Record<Shift, QcStatus | "MISSING">>({
    AM: "MISSING",
    PM: "MISSING",
  });
  const [syncingToCurd, setSyncingToCurd] = useState(false);
  const [deliveryOverrideEnabled, setDeliveryOverrideEnabled] = useState(false);
  const [deliveryOverrideReason, setDeliveryOverrideReason] = useState("");
  const autoAssignDateRef = useRef<string>("");
  const legacyBootstrapDateRef = useRef<string>("");

  const taskKey = useCallback((customerId: string | null | undefined, customerName: string, shift: Shift | null | undefined) => {
    const customerPart = customerId?.trim() ? customerId.trim() : customerName.trim().toLowerCase();
    return `${customerPart}__${shift ?? "AM"}`;
  }, []);

  const ensureBaseSubscriptionTasks = useCallback(
    async (rows: DeliveryTaskResponse[]) => {
      if (!isPrivileged) {
        return rows;
      }
      if (legacyBootstrapDateRef.current === date) {
        return rows;
      }

      const existing = new Set(
        rows
          .filter((row) => (row.productType ?? "MILK") === "MILK")
          .map((row) => taskKey(row.customerId, row.customerName, row.taskShift))
      );
      const activeCustomers = await CustomerApi.list({ active: true });
      const legacyDailyCustomers = activeCustomers.filter(
        (row) => row.subscriptionActive && (row.dailySubscriptionQty ?? 0) > 0
      );
      if (legacyDailyCustomers.length === 0) {
        legacyBootstrapDateRef.current = date;
        return rows;
      }

      const creates: Promise<DeliveryTaskResponse>[] = [];
      for (const customer of legacyDailyCustomers) {
        const totalQty = customer.dailySubscriptionQty ?? 0;
        if (totalQty <= 0) {
          continue;
        }
        const amQty = Number((totalQty / 2).toFixed(2));
        const pmQty = Number((totalQty - amQty).toFixed(2));
        const plans = [
          { shift: "AM" as Shift, qty: amQty, preferredTime: "06:30" },
          { shift: "PM" as Shift, qty: pmQty, preferredTime: "17:30" },
        ];
        for (const plan of plans) {
          if (plan.qty <= 0) {
            continue;
          }
          const key = taskKey(customer.customerId, customer.customerName, plan.shift);
          if (existing.has(key)) {
            continue;
          }
          existing.add(key);
          creates.push(
            DeliveryTaskApi.create({
              taskDate: date,
              taskShift: plan.shift,
              preferredTime: plan.preferredTime,
              customerId: customer.customerId,
              customerName: null,
              productType: "MILK",
              plannedQtyLiters: plan.qty,
              unitPrice: customer.defaultMilkUnitPrice ?? null,
              paymentMode: "CREDIT",
              notes: "Auto-generated from customer daily subscription quantity.",
            })
          );
        }
      }
      if (creates.length === 0) {
        legacyBootstrapDateRef.current = date;
        return rows;
      }
      await Promise.all(creates);
      legacyBootstrapDateRef.current = date;
      return DeliveryTaskApi.list({ date });
    },
    [date, isPrivileged, taskKey]
  );

  const refreshPendingSync = useCallback(async () => {
    setPendingSync(await getPendingSyncSummary());
  }, []);

  const load = useCallback(async () => {
    if (!canAccess) {
      setTasks([]);
      setRows([]);
      setRunClosures([]);
      setSubscriptionPreview(null);
      setStockSummary(null);
      setQcByShift({ AM: "MISSING", PM: "MISSING" });
      return;
    }
    try {
      setLoading(true);
      let taskRows: DeliveryTaskResponse[] = [];
      const [initialTaskRows, reconRows, closureRows, stockRes, amBatch, pmBatch] = await Promise.all([
        DeliveryTaskApi.list({ date }),
        DeliveryTaskApi.reconciliation(date),
        DeliveryTaskApi.listRunClosures(date),
        StockManagerApi.summary(date).catch(() => null),
        MilkApi.getBatch(date, "AM").catch(() => null),
        MilkApi.getBatch(date, "PM").catch(() => null),
      ]);
      taskRows = initialTaskRows;

      // If the day has no tasks yet, bootstrap full day plan once (generate + assign + optimize).
      if (isPrivileged && taskRows.length === 0) {
        await DeliveryTaskApi.triggerDayPlan(date, true, true).catch((e) => {
          console.error(e);
        });
        taskRows = await DeliveryTaskApi.list({ date }).catch(() => taskRows);
      }

      const ensuredTaskRows = await ensureBaseSubscriptionTasks(taskRows);
      setTasks(ensuredTaskRows);
      setRows(reconRows);
      setRunClosures(closureRows);
      setStockSummary(stockRes);
      setQcByShift({
        AM: amBatch?.qcStatus ?? "MISSING",
        PM: pmBatch?.qcStatus ?? "MISSING",
      });
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load delivery operations.", "डिलीवरी ऑपरेशन डेटा लोड नहीं हुआ।")
      );
    } finally {
      setLoading(false);
    }
  }, [canAccess, date, ensureBaseSubscriptionTasks, isPrivileged, x]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void refreshPendingSync();
  }, [refreshPendingSync]);

  useEffect(() => {
    if (!canAccess) {
      setCustomerOptions([]);
      return;
    }
    void CustomerApi.list({ active: true })
      .then(setCustomerOptions)
      .catch((e) => {
        console.error(e);
      });
  }, [canAccess]);

  useEffect(() => {
    if (!canAccess || !isPrivileged) {
      setDeliveryUsers([]);
      return;
    }
    void AuthApi.listAssignableUsers(["DELIVERY", "WORKER", "MANAGER"])
      .then((rows) => setDeliveryUsers(rows.filter((row) => row.active)))
      .catch((e) => {
        console.error(e);
      });
  }, [canAccess, isPrivileged]);

  const assigneeOptions = useMemo(() => {
    const set = new Set<string>();
    deliveryUsers.forEach((row) => {
      if (row.username?.trim()) {
        set.add(row.username.trim());
      }
    });
    tasks.forEach((task) => {
      if (task.assignedToUsername?.trim()) {
        set.add(task.assignedToUsername.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [deliveryUsers, tasks]);

  useEffect(() => {
    if (!isPrivileged) {
      autoAssignDateRef.current = "";
      return;
    }
    if (autoAssignDateRef.current === date) {
      return;
    }
    const activeUsers = deliveryUsers.filter((row) => row.active);
    if (activeUsers.length === 0) {
      return;
    }
    const unassigned = tasks.filter(
      (task) => task.status === "PENDING" && !(task.assignedToUsername ?? "").trim()
    );
    if (unassigned.length === 0) {
      autoAssignDateRef.current = date;
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        autoAssignDateRef.current = date;
        let idx = 0;
        for (const task of unassigned) {
          const nextUser = activeUsers[idx % activeUsers.length];
          idx += 1;
          if (!nextUser) {
            continue;
          }
          await DeliveryTaskApi.assign(task.deliveryTaskId, {
            assignedToUsername: nextUser.username,
            notes: "Auto-assigned for daily route execution.",
          });
        }
        if (cancelled) {
          return;
        }
        await load();
      } catch (e) {
        console.error(e);
        autoAssignDateRef.current = "";
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [date, deliveryUsers, isPrivileged, load, tasks]);

  const byAssignee = useMemo(() => {
    if (!isPrivileged) {
      const me = (user?.username ?? "").trim().toLowerCase();
      return tasks.filter((task) => {
        const assignee = (task.assignedToUsername ?? "").trim().toLowerCase();
        return !assignee || assignee === me;
      });
    }
    if (assigneeFilter === "ALL") {
      return tasks;
    }
    if (assigneeFilter === "UNASSIGNED") {
      return tasks.filter((task) => !task.assignedToUsername);
    }
    return tasks.filter(
      (task) => (task.assignedToUsername ?? "").toLowerCase() === assigneeFilter.toLowerCase()
    );
  }, [assigneeFilter, isPrivileged, tasks, user?.username]);

  const filtered = useMemo(() => {
    return byAssignee.filter((task) => {
      if (shiftFilter === "ALL") return true;
      return (task.taskShift ?? "AM") === shiftFilter;
    });
  }, [byAssignee, shiftFilter]);

  const grouped = useMemo(() => {
    const byRoute = new Map<string, DeliveryTaskResponse[]>();
    for (const row of filtered) {
      const key = routeKey(row.routeName);
      if (!byRoute.has(key)) {
        byRoute.set(key, []);
      }
      byRoute.get(key)?.push(row);
    }
    return Array.from(byRoute.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([routeName, items]) => ({
        routeName,
        items: [...items].sort(compareTaskOrder),
      }));
  }, [filtered]);

  const runRouteOptions = useMemo(() => grouped.map((g) => g.routeName), [grouped]);

  useEffect(() => {
    if (!runRouteOptions.length) {
      setRunRoute("");
      setRunActive(false);
      return;
    }
    if (!runRoute || !runRouteOptions.includes(runRoute)) {
      setRunRoute(runRouteOptions[0]);
    }
  }, [runRoute, runRouteOptions]);

  useEffect(() => {
    setRunActive(false);
    setRunCollectedByTaskId({});
    setRunNoteByTaskId({});
    setAssigneePickerTaskId(null);
    setClosureCash("");
    setClosureUpi("");
    setClosureOther("");
    setClosureNotes("");
  }, [date]);

  const summary = useMemo(() => {
    const total = filtered.length;
    const delivered = filtered.filter((t) => t.status === "DELIVERED").length;
    const pending = filtered.filter((t) => t.status === "PENDING").length;
    const skipped = filtered.filter((t) => t.status === "SKIPPED").length;
    return { total, delivered, pending, skipped };
  }, [filtered]);

  const scopedTasks = useMemo(() => {
    if (isPrivileged) {
      return tasks;
    }
    const me = (user?.username ?? "").trim().toLowerCase();
    return tasks.filter((task) => {
      const assignee = (task.assignedToUsername ?? "").trim().toLowerCase();
      return !assignee || assignee === me;
    });
  }, [isPrivileged, tasks, user?.username]);

  const shiftCloseSummary = useMemo(() => {
    const shifts: Shift[] = ["AM", "PM"];
    const stats = shifts.map((shift) => {
      const rowsForShift = scopedTasks.filter((task) => (task.taskShift ?? "AM") === shift);
      const total = rowsForShift.length;
      const pending = rowsForShift.filter((task) => task.status === "PENDING").length;
      return {
        shift,
        total,
        pending,
        closed: total > 0 && pending === 0,
      };
    });
    const hasAm = stats.some((row) => row.shift === "AM" && row.total > 0);
    const hasPm = stats.some((row) => row.shift === "PM" && row.total > 0);
    const bothClosed = stats.every((row) => (row.total > 0 ? row.closed : true)) && hasAm && hasPm;
    return { stats, hasAm, hasPm, bothClosed };
  }, [scopedTasks]);

  const dispatchReadiness = useMemo(() => {
    const shifts: Shift[] = ["AM", "PM"];
    const milkTasks = scopedTasks.filter((task) => taskProductType(task) === "MILK");
    const byShift = shifts.map((shift) => {
      const rows = milkTasks.filter((task) => (task.taskShift ?? "AM") === shift);
      const pendingLiters = rows.reduce(
        (sum, row) => sum + (row.status === "PENDING" ? row.plannedQtyLiters : 0),
        0
      );
      const deliveredLiters = rows.reduce(
        (sum, row) =>
          sum +
          (row.status === "DELIVERED"
            ? row.deliveredQtyLiters ?? row.plannedQtyLiters
            : 0),
        0
      );
      return {
        shift,
        stops: rows.length,
        pendingLiters,
        deliveredLiters,
      };
    });
    const totalPendingMilkLiters = byShift.reduce((sum, row) => sum + row.pendingLiters, 0);
    const totalDeliveredMilkLiters = byShift.reduce((sum, row) => sum + row.deliveredLiters, 0);
    const availableMilkLiters = stockSummary?.milkBalanceLiters ?? 0;
    const deficitLiters = Math.max(0, totalPendingMilkLiters - availableMilkLiters);
    const surplusLiters = Math.max(0, availableMilkLiters - totalPendingMilkLiters);
    const pendingNonMilkStops = scopedTasks.filter(
      (task) => task.status === "PENDING" && taskProductType(task) !== "MILK"
    ).length;
    return {
      byShift,
      totalPendingMilkLiters,
      totalDeliveredMilkLiters,
      availableMilkLiters,
      deficitLiters,
      surplusLiters,
      pendingNonMilkStops,
      ready: deficitLiters <= 0,
    };
  }, [scopedTasks, stockSummary?.milkBalanceLiters]);

  const pendingMilkToCurd = useMemo(() => {
    if (!shiftCloseSummary.bothClosed) {
      return 0;
    }
    return stockSummary?.milkBalanceLiters ?? 0;
  }, [shiftCloseSummary.bothClosed, stockSummary?.milkBalanceLiters]);

  const runTasks = useMemo(
    () =>
      byAssignee
        .filter(
        (task) =>
          routeKey(task.routeName) === runRoute &&
          (task.taskShift ?? "AM") === runShift
      )
        .sort(compareTaskOrder),
    [byAssignee, runRoute, runShift]
  );

  const runSummary = useMemo(() => {
    const totalStops = runTasks.length;
    const deliveredStops = runTasks.filter((t) => t.status === "DELIVERED").length;
    const pendingStops = runTasks.filter((t) => t.status === "PENDING").length;
    const skippedStops = runTasks.filter((t) => t.status === "SKIPPED").length;
    const plannedQty = runTasks.reduce((sum, row) => sum + row.plannedQtyLiters, 0);
    const deliveredQty = runTasks.reduce(
      (sum, row) =>
        sum +
        (row.status === "DELIVERED"
          ? row.deliveredQtyLiters ?? row.plannedQtyLiters
          : 0),
      0
    );
    const expectedCollection = runTasks.reduce(
      (sum, row) =>
        sum +
        (row.status === "DELIVERED"
          ? (row.deliveredQtyLiters ?? row.plannedQtyLiters) * row.unitPrice
          : 0),
      0
    );
    const expectedCash = runTasks.reduce(
      (sum, row) =>
        sum +
        (row.status === "DELIVERED" && row.paymentMode === "CASH"
          ? (row.deliveredQtyLiters ?? row.plannedQtyLiters) * row.unitPrice
          : 0),
      0
    );
    const expectedUpi = runTasks.reduce(
      (sum, row) =>
        sum +
        (row.status === "DELIVERED" && row.paymentMode === "UPI"
          ? (row.deliveredQtyLiters ?? row.plannedQtyLiters) * row.unitPrice
          : 0),
      0
    );
    const expectedOther = Math.max(0, expectedCollection - expectedCash - expectedUpi);
    return {
      totalStops,
      deliveredStops,
      pendingStops,
      skippedStops,
      plannedQty,
      deliveredQty,
      expectedCollection,
      expectedCash,
      expectedUpi,
      expectedOther,
    };
  }, [runTasks]);

  const runPendingMilkLiters = useMemo(
    () =>
      runTasks.reduce(
        (sum, row) =>
          sum +
          (row.status === "PENDING" && taskProductType(row) === "MILK"
            ? row.plannedQtyLiters
            : 0),
        0
      ),
    [runTasks]
  );
  const runAvailableMilkLiters = stockSummary?.milkBalanceLiters ?? 0;
  const runMilkDeficitLiters = Math.max(0, runPendingMilkLiters - runAvailableMilkLiters);
  const runHasMilkStops = useMemo(
    () => runTasks.some((row) => taskProductType(row) === "MILK"),
    [runTasks]
  );
  const runShiftQcStatus = qcByShift[runShift];

  const runStartBlock = useMemo(() => {
    if (!runRoute) {
      return {
        title: x("Missing route", "रूट नहीं चुना"),
        body: x("Select route before starting run mode.", "रन मोड शुरू करने से पहले रूट चुनें।"),
      };
    }
    if (runTasks.length === 0) {
      return {
        title: x("No tasks", "कोई टास्क नहीं"),
        body: x("No delivery tasks for selected route and shift.", "चुने हुए रूट और शिफ्ट के लिए कोई डिलीवरी टास्क नहीं है।"),
      };
    }
    if (runHasMilkStops && runShiftQcStatus !== "PASS") {
      return {
        title: x("QC not ready", "QC तैयार नहीं"),
        body: x(
          `${label("shift", runShift)} milk delivery can start only when QC is PASS. Current: ${qcLabel(runShiftQcStatus)}.`,
          `${label("shift", runShift)} दूध डिलीवरी तभी शुरू होगी जब QC PASS हो। अभी: ${qcLabel(runShiftQcStatus)}।`
        ),
      };
    }
    if (runMilkDeficitLiters > 0 && !isPrivileged) {
      return {
        title: x("Stock not ready", "स्टॉक पर्याप्त नहीं"),
        body: x(
          `Pending milk ${runPendingMilkLiters.toFixed(2)} L is higher than available stock ${runAvailableMilkLiters.toFixed(2)} L.`,
          `रन के लिए लंबित दूध ${runPendingMilkLiters.toFixed(2)} L है, जबकि उपलब्ध स्टॉक ${runAvailableMilkLiters.toFixed(2)} L है।`
        ),
      };
    }
    return null;
  }, [
    isPrivileged,
    label,
    runAvailableMilkLiters,
    runHasMilkStops,
    runMilkDeficitLiters,
    runPendingMilkLiters,
    runRoute,
    runShift,
    runShiftQcStatus,
    runTasks.length,
    x,
  ]);
  const canStartRun = !runActive && !runStartBlock;

  const closureActual = useMemo(() => {
    const cash = Number(closureCash);
    const upi = Number(closureUpi);
    const other = Number(closureOther);
    return (Number.isFinite(cash) ? cash : 0) + (Number.isFinite(upi) ? upi : 0) + (Number.isFinite(other) ? other : 0);
  }, [closureCash, closureOther, closureUpi]);

  const closureVariance = closureActual - runSummary.expectedCollection;
  const latestClosure = runClosures[0] ?? null;

  const closureSummary = useMemo(() => {
    const totalRuns = runClosures.length;
    const totalStops = runClosures.reduce((sum, row) => sum + row.totalStops, 0);
    const totalDelivered = runClosures.reduce((sum, row) => sum + row.deliveredStops, 0);
    const totalExpected = runClosures.reduce((sum, row) => sum + row.expectedCollection, 0);
    const totalActual = runClosures.reduce((sum, row) => sum + row.actualCollection, 0);
    const totalVariance = runClosures.reduce((sum, row) => sum + row.variance, 0);
    return { totalRuns, totalStops, totalDelivered, totalExpected, totalActual, totalVariance };
  }, [runClosures]);

  const stockTransferState = useMemo(() => {
    if (latestClosure?.stockTransferState) {
      return latestClosure.stockTransferState;
    }
    if (!shiftCloseSummary.bothClosed) {
      return "WAITING_SHIFT_CLOSE";
    }
    return pendingMilkToCurd > 0 ? "READY_FOR_AUTO_TRANSFER" : "NO_PENDING_TRANSFER";
  }, [latestClosure?.stockTransferState, pendingMilkToCurd, shiftCloseSummary.bothClosed]);

  const stockTransferPendingLiters = useMemo(
    () => latestClosure?.pendingMilkToCurdLiters ?? pendingMilkToCurd,
    [latestClosure?.pendingMilkToCurdLiters, pendingMilkToCurd]
  );

  const stockTransferAlertMessage = useMemo(() => {
    if (latestClosure?.stockAlertMessage?.trim()) {
      return latestClosure.stockAlertMessage;
    }
    if (stockTransferState === "READY_FOR_AUTO_TRANSFER") {
      return x(
        `Both shifts closed. Pending milk ${stockTransferPendingLiters.toFixed(2)} L should move to curd.`,
        `दोनों शिफ्ट बंद हैं। बाकी दूध ${stockTransferPendingLiters.toFixed(2)} L को दही में डालें।`
      );
    }
    if (stockTransferState === "AUTO_TRANSFERRED") {
      return x("Milk-to-curd transfer was auto-completed.", "दूध से दही ट्रांसफर अपने आप पूरा हो गया।");
    }
    if (stockTransferState === "NO_PENDING_TRANSFER") {
      return x("Both shifts closed and no pending milk transfer remains.", "दोनों शिफ्ट बंद हैं और दूध ट्रांसफर लंबित नहीं है।");
    }
    return x(
      "AM and PM shift closure is still in progress. Alerts stay active.",
      "AM और PM शिफ्ट क्लोजर अभी प्रगति में है। अलर्ट सक्रिय रहेंगे।"
    );
  }, [latestClosure?.stockAlertMessage, stockTransferPendingLiters, stockTransferState, x]);

  const stockTransferVisual = useMemo(() => stockTransferTone(stockTransferState), [stockTransferState]);
  const amShiftClosed = useMemo(
    () => latestClosure?.amShiftClosed ?? shiftCloseSummary.stats.find((row) => row.shift === "AM")?.closed ?? false,
    [latestClosure?.amShiftClosed, shiftCloseSummary.stats]
  );
  const pmShiftClosed = useMemo(
    () => latestClosure?.pmShiftClosed ?? shiftCloseSummary.stats.find((row) => row.shift === "PM")?.closed ?? false,
    [latestClosure?.pmShiftClosed, shiftCloseSummary.stats]
  );

  const previewSkippedItems = useMemo(
    () => subscriptionPreview?.items.filter((item) => !item.eligible) ?? [],
    [subscriptionPreview]
  );

  const previewReasonBuckets = useMemo(() => {
    const counts: Record<string, number> = {};
    previewSkippedItems.forEach((item) => {
      const key = normalizePreviewReason(item.reason);
      counts[key] = (counts[key] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => ({
        reason,
        count,
        label: PREVIEW_REASON_LABELS[reason] ?? PREVIEW_REASON_LABELS.UNKNOWN,
      }));
  }, [previewSkippedItems]);

  const selectedCustomer = useMemo(
    () => customerOptions.find((row) => row.customerId === addOnCustomerId) ?? null,
    [addOnCustomerId, customerOptions]
  );

  const saveAddOn = async () => {
    if (!canCreateAddOn) {
      Alert.alert(
        x("Role restricted", "रोल अनुमति नहीं"),
        x(
          "Only ADMIN, MANAGER or DELIVERY can add extra delivery requests.",
          "एक्स्ट्रा डिलीवरी रिक्वेस्ट सिर्फ ADMIN, MANAGER या DELIVERY जोड़ सकते हैं।"
        )
      );
      return;
    }
    const qty = Number(addOnQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert(
        x("Invalid value", "गलत मान"),
        x("Extra quantity must be a positive number.", "एक्स्ट्रा मात्रा पॉजिटिव संख्या होनी चाहिए।")
      );
      return;
    }
    const unitPrice = addOnUnitPrice.trim() ? Number(addOnUnitPrice) : null;
    if (unitPrice != null && (!Number.isFinite(unitPrice) || unitPrice <= 0)) {
      Alert.alert(
        x("Invalid value", "गलत मान"),
        x("Unit price must be a positive number.", "यूनिट कीमत पॉजिटिव संख्या होनी चाहिए।")
      );
      return;
    }
    const preferredTime = addOnPreferredTime.trim();
    if (preferredTime && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(preferredTime)) {
      Alert.alert(
        x("Invalid time", "गलत समय"),
        x("Use time format HH:mm.", "समय का फॉर्मेट HH:mm रखें।")
      );
      return;
    }
    const customerName = addOnCustomerName.trim();
    if (!addOnCustomerId && !customerName) {
      Alert.alert(
        x("Missing details", "जानकारी अधूरी"),
        x("Select a customer or enter customer name.", "ग्राहक चुनें या ग्राहक नाम लिखें।")
      );
      return;
    }

    try {
      setAddOnSaving(true);
      const payload = {
        taskDate: date,
        taskShift: addOnShift,
        preferredTime: preferredTime || null,
        customerId: addOnCustomerId,
        customerName: addOnCustomerId ? null : customerName,
        productType: addOnProductType,
        quantity: qty,
        unitPrice,
        notes: addOnNotes.trim() || null,
      } as const;
      await DeliveryTaskApi.addOn(payload);
      setAddOnQty("");
      setAddOnUnitPrice("");
      setAddOnNotes("");
      await load();
      Alert.alert(
        x("Saved", "सेव हो गया"),
        x("Add-on request merged into delivery plan.", "एक्स्ट्रा रिक्वेस्ट डिलीवरी प्लान में जोड़ दी गई।")
      );
    } catch (e: any) {
      console.error(e);
      if (shouldQueueForOffline(e)) {
        await queueDeliveryAddOn(
          {
            taskDate: date,
            taskShift: addOnShift,
            preferredTime: preferredTime || null,
            customerId: addOnCustomerId,
            customerName: addOnCustomerId ? null : customerName,
            productType: addOnProductType,
            quantity: qty,
            unitPrice,
            notes: addOnNotes.trim() || null,
          },
          String(e?.message ?? "")
        );
        await refreshPendingSync();
        Alert.alert(
          x("Saved Offline", "ऑफलाइन सेव"),
          x(
            "Network is unavailable. Request is queued and will sync later.",
            "नेटवर्क नहीं है। रिक्वेस्ट कतार में सेव हो गई है और बाद में सिंक होगी।"
          )
        );
        return;
      }
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not save add-on request.", "एक्स्ट्रा रिक्वेस्ट सेव नहीं हो पाई।")
      );
    } finally {
      setAddOnSaving(false);
    }
  };

  const syncPending = async () => {
    try {
      setSyncing(true);
      const result = await flushPendingSyncOperations();
      await refreshPendingSync();
      await load();
      if (result.processed === 0) {
        Alert.alert(x("No pending sync", "कोई पेंडिंग सिंक नहीं"), x("All operations are already synced.", "सभी ऑपरेशन पहले से सिंक हैं।"));
        return;
      }
      Alert.alert(
        x("Sync complete", "सिंक पूरा"),
        x(
          `Processed ${result.processed} | Synced ${result.success} | Remaining ${result.remaining}`,
          `प्रोसेस ${result.processed} | सिंक ${result.success} | बाकी ${result.remaining}`
        )
      );
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Sync failed", "सिंक असफल"),
        e?.message ?? x("Could not sync pending operations.", "पेंडिंग ऑपरेशन सिंक नहीं हुए।")
      );
    } finally {
      setSyncing(false);
    }
  };

  const generateFromSubscriptions = async () => {
    if (!isPrivileged) {
      return;
    }
    try {
      setGeneratingSubscriptions(true);
      const planned = await DeliveryTaskApi.triggerDayPlan(date, true);
      autoAssignDateRef.current = "";
      await load();
      Alert.alert(
        x("Plan generated", "प्लान तैयार"),
        x(
          `Date ${planned.date} | Candidates ${planned.eligibleCandidates} | Existing ${planned.alreadyPlannedCandidates} | Blocked ${planned.blockedCandidates} | Generated ${planned.generatedTasks} | Auto-assigned ${planned.autoAssignedTasks} | Optimized ${planned.optimizedTasks} | Routes ${planned.optimizedRoutes} | Total ${planned.totalTasks} | Pending ${planned.pendingTasks}`,
          `तारीख ${planned.date} | उम्मीदवार ${planned.eligibleCandidates} | पहले से मौजूद ${planned.alreadyPlannedCandidates} | ब्लॉक ${planned.blockedCandidates} | जेनरेट ${planned.generatedTasks} | ऑटो-असाइन ${planned.autoAssignedTasks} | ऑप्टिमाइज़ ${planned.optimizedTasks} | रूट ${planned.optimizedRoutes} | कुल ${planned.totalTasks} | बाकी ${planned.pendingTasks}`
        )
      );
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Generate failed", "जेनरेट असफल"),
        e?.message ?? x("Could not generate subscription tasks.", "सब्सक्रिप्शन टास्क तैयार नहीं हो पाए।")
      );
    } finally {
      setGeneratingSubscriptions(false);
    }
  };

  const optimizeRoutesNow = async () => {
    if (!isPrivileged) {
      return;
    }
    try {
      setOptimizingRoutes(true);
      const optimized = await DeliveryTaskApi.optimize({
        date,
        shift: shiftFilter === "ALL" ? null : shiftFilter,
        routeName: null,
      });
      setLastOptimization(optimized);
      await load();
      Alert.alert(
        x("Routes optimized", "रूट ऑप्टिमाइज़"),
        x(
          `Optimized ${optimized.optimizedTasks} tasks across ${optimized.optimizedRoutes} route groups.`,
          `${optimized.optimizedTasks} टास्क और ${optimized.optimizedRoutes} रूट ग्रुप ऑप्टिमाइज़ हुए।`
        )
      );
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Optimize failed", "ऑप्टिमाइज़ असफल"),
        e?.message ?? x("Could not optimize routes.", "रूट ऑप्टिमाइज़ नहीं हो पाए।")
      );
    } finally {
      setOptimizingRoutes(false);
    }
  };

  const previewFromSubscriptions = async () => {
    if (!isPrivileged) {
      return;
    }
    try {
      setPreviewingSubscriptions(true);
      const preview = await DeliveryTaskApi.previewSubscriptions(date);
      setSubscriptionPreview(preview);

      const reasonCounts: Record<string, number> = {};
      preview.items
        .filter((item) => !item.eligible)
        .forEach((item) => {
          const key = normalizePreviewReason(item.reason);
          reasonCounts[key] = (reasonCounts[key] ?? 0) + 1;
        });
      const reasonSummary = Object.entries(reasonCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reason, count]) => {
          const label = PREVIEW_REASON_LABELS[reason] ?? PREVIEW_REASON_LABELS.UNKNOWN;
          return `${label.en} (${reason}): ${count}`;
        })
        .join(" | ");

      Alert.alert(
        x("Preview ready", "प्रीव्यू तैयार"),
        x(
          `Candidates ${preview.totalCandidates} | Eligible ${preview.eligibleCandidates} | Skipped ${preview.skippedCandidates}${reasonSummary ? `\n${reasonSummary}` : ""}`,
          `उम्मीदवार ${preview.totalCandidates} | योग्य ${preview.eligibleCandidates} | स्किप ${preview.skippedCandidates}${reasonSummary ? `\n${reasonSummary}` : ""}`
        )
      );
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Preview failed", "प्रीव्यू असफल"),
        e?.message ?? x("Could not preview subscription generation.", "सब्सक्रिप्शन प्रीव्यू नहीं बन पाया।")
      );
    } finally {
      setPreviewingSubscriptions(false);
    }
  };

  const canActOnTask = useCallback(
    (task: DeliveryTaskResponse) => {
      if (isPrivileged) {
        return true;
      }
      const currentAssignee = (task.assignedToUsername ?? "").trim().toLowerCase();
      const me = (user?.username ?? "").trim().toLowerCase();
      if (currentAssignee && me && currentAssignee !== me) {
        return false;
      }
      return true;
    },
    [isPrivileged, user?.username]
  );

  const canClaimTask = (task: DeliveryTaskResponse) => {
    if (!canActOnTask(task)) {
      return false;
    }
    const currentAssignee = task.assignedToUsername?.trim();
    return !isPrivileged && !currentAssignee && task.status === "PENDING";
  };

  const taskBusy = (deliveryTaskId: string) =>
    bulkUpdatingRun || savingTaskId === deliveryTaskId || assigningTaskId === deliveryTaskId;

  const claimTask = async (task: DeliveryTaskResponse, notes?: string | null) => {
    await updateTaskStatus(task, "PENDING", { notes: notes ?? null });
  };

  const assignTaskOwner = async (
    task: DeliveryTaskResponse,
    assignedToUsername: string | null,
    notes?: string | null
  ) => {
    if (!isPrivileged) {
      return;
    }
    if (task.status === "DELIVERED") {
      Alert.alert(
        x("Reassign blocked", "रीअसाइन संभव नहीं"),
        x("Delivered task cannot be reassigned.", "डिलीवर हो चुका टास्क रीअसाइन नहीं हो सकता।")
      );
      return;
    }
    try {
      setAssigningTaskId(task.deliveryTaskId);
      await DeliveryTaskApi.assign(task.deliveryTaskId, {
        assignedToUsername: assignedToUsername?.trim() || null,
        notes: notes?.trim() || null,
      });
      setAssigneePickerTaskId((prev) => (prev === task.deliveryTaskId ? null : prev));
      await load();
      Alert.alert(
        x("Assignment updated", "असाइनमेंट अपडेट"),
        assignedToUsername
          ? x(
              `Task assigned to ${assignedToUsername}.`,
              `टास्क ${assignedToUsername} को असाइन किया गया।`
            )
          : x("Task is now unassigned.", "टास्क अब अनअसाइन्ड है।")
      );
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Update failed", "अपडेट नहीं हुआ"),
        e?.message ?? x("Could not update task assignment.", "टास्क असाइनमेंट अपडेट नहीं हुआ।")
      );
    } finally {
      setAssigningTaskId(null);
    }
  };

  const updateTaskStatus = async (
    task: DeliveryTaskResponse,
    status: DeliveryTaskStatus,
    options?: { collectedAmountText?: string; notes?: string | null }
  ) => {
    if (!canActOnTask(task)) {
      Alert.alert(
        x("Task assigned to another user", "टास्क किसी और को असाइन है"),
        x(
          `This stop is assigned to ${task.assignedToUsername}. Please claim another task or ask manager to reassign.`,
          `यह स्टॉप ${task.assignedToUsername} को असाइन है। दूसरा टास्क लें या मैनेजर से रीअसाइन करवाएं।`
        )
      );
      return;
    }
    const collectedRaw = options?.collectedAmountText?.trim() ?? "";
    let parsedCollectedAmount: number | null = null;
    if (collectedRaw) {
      const value = Number(collectedRaw);
      if (!Number.isFinite(value) || value < 0) {
        Alert.alert(
          x("Invalid amount", "गलत राशि"),
          x("Collected amount must be zero or positive.", "कलेक्शन राशि शून्य या पॉजिटिव होनी चाहिए।")
        );
        return;
      }
      parsedCollectedAmount = value;
    }

    const overrideEnabledForThisUpdate =
      status === "DELIVERED" && isPrivileged && deliveryOverrideEnabled;
    if (overrideEnabledForThisUpdate && !deliveryOverrideReason.trim()) {
      Alert.alert(
        x("Override reason required", "ओवरराइड कारण जरूरी"),
        x(
          "Add withdrawal override reason before forcing delivery.",
          "डिलीवरी force करने से पहले withdrawal override reason दर्ज करें।"
        )
      );
      return;
    }

    const payload: UpdateDeliveryTaskStatusPayload = {
      status,
      deliveredQtyLiters:
        status === "DELIVERED"
          ? task.deliveredQtyLiters ?? task.plannedQtyLiters
          : task.deliveredQtyLiters ?? null,
      collectedAmount: parsedCollectedAmount,
      overrideWithdrawalLock: overrideEnabledForThisUpdate ? true : undefined,
      overrideReason: overrideEnabledForThisUpdate ? deliveryOverrideReason.trim() : undefined,
      notes: options?.notes?.trim() || null,
    };

    try {
      setSavingTaskId(task.deliveryTaskId);
      const currentAssignee = (task.assignedToUsername ?? "").trim().toLowerCase();
      if (!currentAssignee && user?.username) {
        await DeliveryTaskApi.assign(task.deliveryTaskId, {
          assignedToUsername: user.username,
          notes: "Claimed automatically on status update.",
        });
      }
      await DeliveryTaskApi.updateStatus(task.deliveryTaskId, payload);
      if (status === "DELIVERED" || status === "SKIPPED") {
        // Keep stock manager aligned with delivered quantity in near real-time.
        await StockManagerApi.syncDay({
          date,
          autoTransferMilkToCurd: false,
        }).catch((e) => {
          console.error(e);
        });
      }
      setRunCollectedByTaskId((prev) => ({ ...prev, [task.deliveryTaskId]: "" }));
      await load();
    } catch (e: any) {
      console.error(e);
      const message = String(e?.message ?? "");
      if (
        status === "DELIVERED" &&
        message.toLowerCase().includes("withdrawal period active") &&
        isPrivileged &&
        !deliveryOverrideEnabled
      ) {
        Alert.alert(
          x("Withdrawal lock active", "विदड्रॉल लॉक सक्रिय"),
          x(
            "Enable Compliance Override and add reason if emergency delivery is required.",
            "जरूरी डिलीवरी के लिए Compliance Override चालू करें और कारण दर्ज करें।"
          )
        );
        return;
      }
      if (shouldQueueForOffline(e)) {
        await queueDeliveryTaskStatus(task.deliveryTaskId, payload, String(e?.message ?? ""));
        await refreshPendingSync();
        Alert.alert(
          x("Saved Offline", "ऑफलाइन सेव"),
          x("Status update is queued and will sync when network returns.", "स्टेटस अपडेट कतार में है और नेटवर्क आने पर सिंक होगा।")
        );
        return;
      }
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not update task status.", "टास्क स्टेटस अपडेट नहीं हो पाया।")
      );
    } finally {
      setSavingTaskId(null);
    }
  };

  const bulkUpdateRunPending = async (status: "DELIVERED" | "SKIPPED") => {
    if (!canBulkRunActions) {
      Alert.alert(
        x("Role restricted", "रोल अनुमति नहीं"),
        x(
          "Only ADMIN, MANAGER or DELIVERY can use bulk run actions.",
          "बल्क रन एक्शन सिर्फ ADMIN, MANAGER या DELIVERY उपयोग कर सकते हैं।"
        )
      );
      return;
    }
    const pendingTasks = runTasks.filter((task) => task.status === "PENDING");
    if (pendingTasks.length === 0) {
      Alert.alert(
        x("No pending stops", "कोई पेंडिंग स्टॉप नहीं"),
        x("All selected run stops are already processed.", "चुने हुए रन के सभी स्टॉप पहले से प्रोसेस हैं।")
      );
      return;
    }

    const items: UpdateDeliveryTaskStatusBulkItemPayload[] = [];
    const overrideEnabledForRun = status === "DELIVERED" && isPrivileged && deliveryOverrideEnabled;
    if (overrideEnabledForRun && !deliveryOverrideReason.trim()) {
      Alert.alert(
        x("Override reason required", "ओवरराइड कारण जरूरी"),
        x(
          "Add withdrawal override reason before bulk delivery override.",
          "बल्क डिलीवरी ओवरराइड से पहले withdrawal reason दर्ज करें।"
        )
      );
      return;
    }
    for (const task of pendingTasks) {
      const collectedRaw = (runCollectedByTaskId[task.deliveryTaskId] ?? "").trim();
      let collectedAmount: number | null = null;
      if (status === "DELIVERED" && collectedRaw.length > 0) {
        const value = Number(collectedRaw);
        if (!Number.isFinite(value) || value < 0) {
          Alert.alert(
            x("Invalid amount", "गलत राशि"),
            x(
              `Collected amount for ${task.customerName} must be zero or positive.`,
              `${task.customerName} के लिए कलेक्शन राशि शून्य या पॉजिटिव होनी चाहिए।`
            )
          );
          return;
        }
        collectedAmount = value;
      }

      items.push({
        deliveryTaskId: task.deliveryTaskId,
        status,
        deliveredQtyLiters:
          status === "DELIVERED"
            ? task.deliveredQtyLiters ?? task.plannedQtyLiters
            : task.deliveredQtyLiters ?? null,
        collectedAmount,
        overrideWithdrawalLock: overrideEnabledForRun ? true : undefined,
        overrideReason: overrideEnabledForRun ? deliveryOverrideReason.trim() : undefined,
        notes: runNoteByTaskId[task.deliveryTaskId]?.trim() || null,
      });
    }

    try {
      setBulkUpdatingRun(true);
      const result = await DeliveryTaskApi.bulkUpdateStatus({ items });
      await load();
      if (result.failedCount > 0) {
        const topErrors = result.items
          .filter((row) => !row.success)
          .slice(0, 3)
          .map((row) => row.errorMessage ?? "Status update failed")
          .join(" | ");
        Alert.alert(
          x("Partial update", "आंशिक अपडेट"),
          x(
            `Updated ${result.successCount}/${result.totalCount}. Failed ${result.failedCount}. ${topErrors}`,
            `${result.totalCount} में से ${result.successCount} अपडेट हुए। ${result.failedCount} असफल। ${topErrors}`
          )
        );
      } else {
        Alert.alert(
          x("Bulk update done", "बल्क अपडेट पूरा"),
          x(
            `${result.successCount} stops marked as ${status}.`,
            `${result.successCount} स्टॉप ${status} में अपडेट हो गए।`
          )
        );
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Bulk update failed", "बल्क अपडेट असफल"),
        e?.message ?? x("Could not update run tasks in bulk.", "रन टास्क बल्क में अपडेट नहीं हो पाए।")
      );
    } finally {
      setBulkUpdatingRun(false);
    }
  };

  const startRun = () => {
    if (runStartBlock) {
      Alert.alert(runStartBlock.title, runStartBlock.body);
      return;
    }
    if (runMilkDeficitLiters > 0) {
      Alert.alert(
        x("Low milk stock", "दूध स्टॉक कम"),
        x(
          `Pending milk for this run is ${runPendingMilkLiters.toFixed(2)} L but stock is ${runAvailableMilkLiters.toFixed(2)} L. Start anyway?`,
          `इस रन के लिए लंबित दूध ${runPendingMilkLiters.toFixed(2)} L है और स्टॉक ${runAvailableMilkLiters.toFixed(2)} L है। फिर भी रन शुरू करें?`
        ),
        [
          { text: x("Cancel", "रद्द"), style: "cancel" },
          { text: x("Start anyway", "फिर भी शुरू करें"), style: "destructive", onPress: () => setRunActive(true) },
        ]
      );
      return;
    }
    setRunActive(true);
  };

  const closeRun = async () => {
    if (runSummary.pendingStops > 0 && !isPrivileged) {
      Alert.alert(
        x("Pending stops remain", "कुछ स्टॉप बाकी हैं"),
        x(
          "You can close run only after all selected stops are delivered or skipped.",
          "रन बंद करने से पहले सभी चुने हुए स्टॉप डिलीवर या स्किप होने चाहिए।"
        )
      );
      return;
    }
    if (runSummary.pendingStops > 0 && isPrivileged && !closureNotes.trim()) {
      Alert.alert(
        x("Closure note required", "क्लोजर नोट जरूरी"),
        x(
          "Pending stops exist. Add a closure note before closing this run.",
          "कुछ स्टॉप बाकी हैं। यह रन बंद करने से पहले क्लोजर नोट लिखें।"
        )
      );
      return;
    }

    const cash = Number(closureCash);
    const upi = Number(closureUpi);
    const other = Number(closureOther);
    const invalid = [cash, upi, other].some((n) => Number.isNaN(n) || n < 0);
    if (invalid) {
      Alert.alert(
        x("Invalid closure values", "क्लोजर मान गलत"),
        x("Cash/UPI/Other values must be zero or positive.", "कैश/UPI/अन्य मान शून्य या पॉजिटिव होने चाहिए।")
      );
      return;
    }

    try {
      setClosureSaving(true);
      const saved = await DeliveryTaskApi.recordRunClosure({
        date,
        routeName: runRoute,
        shift: runShift,
        totalStops: runSummary.totalStops,
        deliveredStops: runSummary.deliveredStops,
        pendingStops: runSummary.pendingStops,
        skippedStops: runSummary.skippedStops,
        expectedCollection: runSummary.expectedCollection,
        actualCollection: closureActual,
        cashCollection: cash,
        upiCollection: upi,
        otherCollection: other,
        notes: closureNotes.trim() || null,
      });
      setRunClosures((prev) => [saved, ...prev.filter((row) => row.runClosureId !== saved.runClosureId)]);
      setRunActive(false);
      setRunCollectedByTaskId({});
      setRunNoteByTaskId({});
      setClosureCash("");
      setClosureUpi("");
      setClosureOther("");
      setClosureNotes("");
      await load();

      const stockStateLine = saved.stockTransferState
        ? ` | Stock ${saved.stockTransferState}`
        : "";
      const stockMessageLine = saved.stockAlertMessage
        ? `\n${saved.stockAlertMessage}${saved.stockAlertChannel ? ` | Channel ${saved.stockAlertChannel}` : ""}`
        : "";

      Alert.alert(
        x("Run closed", "रन बंद"),
        x(
          `Delivered ${saved.deliveredStops}/${saved.totalStops} | Pending ${saved.pendingStops} | Expected Rs ${saved.expectedCollection.toFixed(
            2
          )} | Actual Rs ${saved.actualCollection.toFixed(2)} | Variance Rs ${saved.variance.toFixed(2)}${stockStateLine}${stockMessageLine}`,
          `डिलीवर ${saved.deliveredStops}/${saved.totalStops} | बाकी ${saved.pendingStops} | अपेक्षित रु ${saved.expectedCollection.toFixed(
            2
          )} | वास्तविक रु ${saved.actualCollection.toFixed(2)} | अंतर रु ${saved.variance.toFixed(2)}${stockStateLine}${stockMessageLine}`
        )
      );
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Close run failed", "रन बंद नहीं हुआ"),
        e?.message ?? x("Could not save run closure. Please retry.", "रन क्लोजर सेव नहीं हुआ। कृपया फिर से कोशिश करें।")
      );
    } finally {
      setClosureSaving(false);
    }
  };

  const movePendingMilkToCurd = async () => {
    if (!isPrivileged || stockTransferPendingLiters <= 0) {
      return;
    }
    try {
      setSyncingToCurd(true);
      const next = await StockManagerApi.syncDay({
        date,
        autoTransferMilkToCurd: true,
      });
      setStockSummary(next);
      await load();
      Alert.alert(
        x("Transferred", "ट्रांसफर हो गया"),
        x(
          `Milk moved to curd. Remaining milk balance: ${next.milkBalanceLiters.toFixed(2)} L`,
          `दूध दही में ट्रांसफर हो गया। बाकी दूध बैलेंस: ${next.milkBalanceLiters.toFixed(2)} L`
        )
      );
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Transfer failed", "ट्रांसफर असफल"),
        e?.message ?? x("Could not auto-transfer milk to curd.", "दूध दही में ट्रांसफर नहीं हो पाया।")
      );
    } finally {
      setSyncingToCurd(false);
    }
  };

  if (!canAccess) {
    return <Redirect href="/services" />;
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: DairyColors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
            {x("Delivery Ops", "डिलीवरी ऑप्स")}
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x("Route checklist and EOD reconciliation", "रूट चेकलिस्ट और दिन के अंत का मिलान")}
          </Text>
        </View>
        <Pressable
          onPress={() => void load()}
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            borderWidth: 1,
            borderColor: DairyColors.border,
            backgroundColor: DairyColors.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={loading ? "sync-circle" : "refresh"} size={20} color={DairyColors.primary} />
        </Pressable>
      </View>

      <DateInput
        value={date}
        onChangeText={setDate}
        placeholder={x("Date (YYYY-MM-DD)", "तारीख (YYYY-MM-DD)")}
      />

      {isPrivileged ? (
        <View style={{ marginTop: 8, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Pressable
            disabled={generatingSubscriptions}
            onPress={() => void generateFromSubscriptions()}
            style={{
              borderRadius: 10,
              backgroundColor: generatingSubscriptions ? DairyColors.textSecondary : DairyColors.primary,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: "white", fontWeight: "800" }}>
              {generatingSubscriptions
                ? x("Generating...", "जेनरेट हो रहा है...")
                : x("Generate from Subscriptions", "सब्सक्रिप्शन से जेनरेट करें")}
            </Text>
          </Pressable>
          <Pressable
            disabled={previewingSubscriptions}
            onPress={() => void previewFromSubscriptions()}
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: DairyColors.border,
              backgroundColor: DairyColors.surface,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
              {previewingSubscriptions ? x("Previewing...", "प्रीव्यू बन रहा...") : x("Preview", "प्रीव्यू")}
            </Text>
          </Pressable>
          <Pressable
            disabled={optimizingRoutes}
            onPress={() => void optimizeRoutesNow()}
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: DairyColors.primary,
              backgroundColor: optimizingRoutes ? DairyColors.textSecondary : DairyColors.primarySoft,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: DairyColors.primary, fontWeight: "800" }}>
              {optimizingRoutes ? x("Optimizing...", "ऑप्टिमाइज़ हो रहा...") : x("Optimize Routes", "रूट ऑप्टिमाइज़")}
            </Text>
          </Pressable>
          <Text style={{ color: DairyColors.textSecondary, paddingTop: 9 }}>
            {x(
              "Use this once per day before assigning/starting route runs.",
              "रूट रन शुरू करने/असाइन करने से पहले दिन में एक बार यह चलाएं।"
            )}
          </Text>
        </View>
      ) : null}

      {isPrivileged && lastOptimization ? (
        <Text style={{ marginTop: 6, color: DairyColors.textSecondary }}>
          {x(
            `Last optimization: ${lastOptimization.optimizedTasks} tasks, ${lastOptimization.optimizedRoutes} routes at ${lastOptimization.optimizedAt ?? "-"}`,
            `आखिरी ऑप्टिमाइज़ेशन: ${lastOptimization.optimizedTasks} टास्क, ${lastOptimization.optimizedRoutes} रूट, समय ${lastOptimization.optimizedAt ?? "-"}`
          )}
        </Text>
      ) : null}

      {isPrivileged && subscriptionPreview ? (
        <View
          style={{
            marginTop: 10,
            borderWidth: 1,
            borderColor: DairyColors.border,
            borderRadius: 12,
            backgroundColor: DairyColors.surface,
            padding: 10,
          }}
        >
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
            {x("Subscription Preview", "सब्सक्रिप्शन प्रीव्यू")}
          </Text>
          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
            {x(
              `Date ${subscriptionPreview.date} | Candidates ${subscriptionPreview.totalCandidates} | Eligible ${subscriptionPreview.eligibleCandidates} | Skipped ${subscriptionPreview.skippedCandidates}`,
              `तारीख ${subscriptionPreview.date} | उम्मीदवार ${subscriptionPreview.totalCandidates} | योग्य ${subscriptionPreview.eligibleCandidates} | स्किप ${subscriptionPreview.skippedCandidates}`
            )}
          </Text>
          {previewReasonBuckets.length > 0 ? (
            <>
              <Text style={{ marginTop: 8, color: DairyColors.textPrimary, fontWeight: "700" }}>
                {x("Skip Reasons", "स्किप कारण")}
              </Text>
              <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {previewReasonBuckets.map((bucket) => (
                  <View
                    key={`preview-reason-${bucket.reason}`}
                    style={{
                      borderWidth: 1,
                      borderColor: DairyColors.border,
                      backgroundColor: DairyColors.surfaceMuted,
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                      {x(
                        `${bucket.label.en} (${bucket.reason}) - ${bucket.count}`,
                        `${bucket.label.hi} (${bucket.reason}) - ${bucket.count}`
                      )}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
          {previewSkippedItems.slice(0, 6).map((item, index) => {
            const reasonKey = normalizePreviewReason(item.reason);
            const reasonLabel = PREVIEW_REASON_LABELS[reasonKey] ?? PREVIEW_REASON_LABELS.UNKNOWN;
            return (
              <Text key={`${item.customerId}-${item.subscriptionLineId ?? item.shift}-${index}`} style={{ marginTop: 6, color: DairyColors.textSecondary }}>
                {x(
                  `${item.customerName} | ${item.shift} | ${item.productType} | ${reasonLabel.en} (${reasonKey})`,
                  `${item.customerName} | ${item.shift} | ${item.productType} | ${reasonLabel.hi} (${reasonKey})`
                )}
              </Text>
            );
          })}
        </View>
      ) : null}

      <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
        {(["ALL", "AM", "PM"] as const).map((shift) => (
          <Pressable
            key={shift}
            onPress={() => setShiftFilter(shift)}
            style={{
              borderWidth: 1,
              borderColor: shiftFilter === shift ? DairyColors.primary : DairyColors.border,
              backgroundColor: shiftFilter === shift ? DairyColors.primarySoft : DairyColors.surface,
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
              {shift === "ALL" ? x("All", "सभी") : label("shift", shift)}
            </Text>
          </Pressable>
        ))}
      </View>

      {isPrivileged ? (
        <View style={{ marginTop: 10 }}>
          <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
            {x("Delivery User Filter", "डिलीवरी यूज़र फ़िल्टर")}
          </Text>
          <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {["ALL", "UNASSIGNED", ...assigneeOptions].map((username) => (
              <Pressable
                key={`assignee-${username}`}
                onPress={() => setAssigneeFilter(username)}
                style={{
                  borderWidth: 1,
                  borderColor: assigneeFilter === username ? DairyColors.primary : DairyColors.border,
                  backgroundColor: assigneeFilter === username ? DairyColors.primarySoft : DairyColors.surface,
                  borderRadius: 999,
                  paddingHorizontal: 11,
                  paddingVertical: 7,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                  {username === "ALL"
                    ? x("All", "सभी")
                    : username === "UNASSIGNED"
                      ? x("Unassigned", "अनअसाइन्ड")
                      : username}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 120, borderRadius: 12, backgroundColor: DairyColors.surfaceMuted, padding: 10 }}>
          <Text style={{ color: DairyColors.textSecondary }}>{x("Total Stops", "कुल स्टॉप")}</Text>
          <Text style={{ marginTop: 4, fontSize: 18, fontWeight: "800", color: DairyColors.textPrimary }}>{summary.total}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 120, borderRadius: 12, backgroundColor: DairyColors.successSoft, padding: 10 }}>
          <Text style={{ color: DairyColors.textSecondary }}>{x("Delivered", "डिलीवर")}</Text>
          <Text style={{ marginTop: 4, fontSize: 18, fontWeight: "800", color: DairyColors.textPrimary }}>{summary.delivered}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 120, borderRadius: 12, backgroundColor: DairyColors.infoSoft, padding: 10 }}>
          <Text style={{ color: DairyColors.textSecondary }}>{x("Pending", "बाकी")}</Text>
          <Text style={{ marginTop: 4, fontSize: 18, fontWeight: "800", color: DairyColors.textPrimary }}>{summary.pending}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 120, borderRadius: 12, backgroundColor: DairyColors.warningSoft, padding: 10 }}>
          <Text style={{ color: DairyColors.textSecondary }}>{x("Skipped", "स्किप")}</Text>
          <Text style={{ marginTop: 4, fontSize: 18, fontWeight: "800", color: DairyColors.textPrimary }}>{summary.skipped}</Text>
        </View>
      </View>

      <View
        style={{
          marginTop: 10,
          borderWidth: 1,
          borderColor: DairyColors.border,
          borderRadius: 12,
          backgroundColor: DairyColors.surface,
          padding: 10,
        }}
      >
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
          {x("Shift Closure Status", "शिफ्ट क्लोज़र स्थिति")}
        </Text>
        {shiftCloseSummary.stats.map((row) => (
          <Text key={`shift-close-${row.shift}`} style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x(
              `${label("shift", row.shift)}: ${row.total} stops | Pending ${row.pending} | QC ${qcLabel(qcByShift[row.shift])} | ${row.closed ? "Closed" : "Open"}`,
              `${label("shift", row.shift)}: ${row.total} स्टॉप | बाकी ${row.pending} | QC ${qcLabel(qcByShift[row.shift])} | ${row.closed ? "बंद" : "खुला"}`
            )}
          </Text>
        ))}
        <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
          {x(
            `Milk balance: ${(stockSummary?.milkBalanceLiters ?? 0).toFixed(2)} L`,
            `दूध बैलेंस: ${(stockSummary?.milkBalanceLiters ?? 0).toFixed(2)} L`
          )}
        </Text>
      </View>

      <View
        style={{
          marginTop: 10,
          borderWidth: 1,
          borderColor: dispatchReadiness.ready ? DairyColors.success : DairyColors.warning,
          borderRadius: 12,
          backgroundColor: dispatchReadiness.ready ? DairyColors.successSoft : DairyColors.warningSoft,
          padding: 10,
        }}
      >
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
          {x("Dispatch Readiness (Milk)", "डिस्पैच तैयारी (दूध)")}
        </Text>
        <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
          {x(
            `Pending milk ${dispatchReadiness.totalPendingMilkLiters.toFixed(2)} L | Available stock ${dispatchReadiness.availableMilkLiters.toFixed(2)} L | Delivered today ${dispatchReadiness.totalDeliveredMilkLiters.toFixed(2)} L`,
            `लंबित दूध ${dispatchReadiness.totalPendingMilkLiters.toFixed(2)} L | उपलब्ध स्टॉक ${dispatchReadiness.availableMilkLiters.toFixed(2)} L | आज डिलीवर ${dispatchReadiness.totalDeliveredMilkLiters.toFixed(2)} L`
          )}
        </Text>
        <Text
          style={{
            marginTop: 4,
            color: dispatchReadiness.ready ? DairyColors.success : DairyColors.warning,
            fontWeight: "700",
          }}
        >
          {dispatchReadiness.ready
            ? x(
                `Ready for dispatch. Surplus ${dispatchReadiness.surplusLiters.toFixed(2)} L`,
                `डिस्पैच के लिए तैयार। अतिरिक्त ${dispatchReadiness.surplusLiters.toFixed(2)} L`
              )
            : x(
                `Shortage ${dispatchReadiness.deficitLiters.toFixed(2)} L. Add/allocate milk before route start.`,
                `कमी ${dispatchReadiness.deficitLiters.toFixed(2)} L है। रूट शुरू करने से पहले दूध जोड़ें/आवंटित करें।`
              )}
        </Text>
        {dispatchReadiness.pendingNonMilkStops > 0 ? (
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x(
              `Pending non-milk stops: ${dispatchReadiness.pendingNonMilkStops}`,
              `लंबित गैर-दूध स्टॉप: ${dispatchReadiness.pendingNonMilkStops}`
            )}
          </Text>
        ) : null}
        {dispatchReadiness.byShift.map((row) => (
          <Text key={`dispatch-shift-${row.shift}`} style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x(
              `${label("shift", row.shift)}: ${row.stops} stops | Pending milk ${row.pendingLiters.toFixed(2)} L | Delivered ${row.deliveredLiters.toFixed(2)} L | QC ${qcLabel(qcByShift[row.shift])}`,
              `${label("shift", row.shift)}: ${row.stops} स्टॉप | लंबित दूध ${row.pendingLiters.toFixed(2)} L | डिलीवर ${row.deliveredLiters.toFixed(2)} L | QC ${qcLabel(qcByShift[row.shift])}`
            )}
          </Text>
        ))}
      </View>

      {isPrivileged ? (
        <View
          style={{
            marginTop: 10,
            borderWidth: 1,
            borderColor: DairyColors.border,
            borderRadius: 12,
            backgroundColor: DairyColors.surface,
            padding: 10,
          }}
        >
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
            {x("Compliance Override (Milk)", "कंप्लायंस ओवरराइड (दूध)")}
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x(
              "Use only when withdrawal lock blocks urgent delivery. Reason is mandatory and audited.",
              "केवल जरूरी डिलीवरी के लिए प्रयोग करें। कारण देना जरूरी है और ऑडिट होगा।"
            )}
          </Text>
          <Pressable
            onPress={() => setDeliveryOverrideEnabled((prev) => !prev)}
            style={{
              marginTop: 8,
              borderWidth: 1,
              borderColor: deliveryOverrideEnabled ? DairyColors.warning : DairyColors.border,
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 8,
              alignSelf: "flex-start",
              backgroundColor: deliveryOverrideEnabled ? DairyColors.warningSoft : DairyColors.surface,
            }}
          >
            <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
              {deliveryOverrideEnabled
                ? x("Override Enabled", "ओवरराइड चालू")
                : x("Enable Override", "ओवरराइड चालू करें")}
            </Text>
          </Pressable>
          {deliveryOverrideEnabled ? (
            <TextInput
              value={deliveryOverrideReason}
              onChangeText={setDeliveryOverrideReason}
              placeholder={x("Override reason (required)", "ओवरराइड कारण (जरूरी)")}
              placeholderTextColor="#99A99A"
              style={{
                marginTop: 8,
                borderWidth: 1,
                borderColor: DairyColors.warning,
                borderRadius: 10,
                padding: 10,
                color: DairyColors.textPrimary,
                backgroundColor: DairyColors.surfaceMuted,
              }}
            />
          ) : null}
        </View>
      ) : null}

      <View
        style={{
          marginTop: 10,
          borderWidth: 1,
          borderColor: stockTransferVisual.text,
          borderRadius: 12,
          backgroundColor: stockTransferVisual.bg,
          padding: 10,
        }}
      >
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
          {x("Stock Transfer Status", "स्टॉक ट्रांसफर स्थिति")}
        </Text>
        <Text style={{ marginTop: 4, color: stockTransferVisual.text, fontWeight: "700" }}>
          {stockTransferAlertMessage}
        </Text>
        <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
          {x(
            `State ${stockTransferState} | Pending ${stockTransferPendingLiters.toFixed(2)} L`,
            `स्थिति ${stockTransferState} | लंबित ${stockTransferPendingLiters.toFixed(2)} L`
          )}
        </Text>
        {latestClosure?.stockAlertChannel ? (
          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
            {x(
              `Alert channel: ${latestClosure.stockAlertChannel}`,
              `अलर्ट चैनल: ${latestClosure.stockAlertChannel}`
            )}
          </Text>
        ) : null}
        {latestClosure?.stockAutoTransferTriggered ? (
          <Text style={{ marginTop: 2, color: DairyColors.success, fontWeight: "700" }}>
            {x("Auto-transfer was triggered on last closure.", "आखिरी क्लोजर में ऑटो-ट्रांसफर चालू हुआ था।")}
          </Text>
        ) : null}
        {stockTransferState === "WAITING_SHIFT_CLOSE" ? (
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x(
              `AM closed: ${amShiftClosed ? "Yes" : "No"} | PM closed: ${pmShiftClosed ? "Yes" : "No"}`,
              `AM बंद: ${amShiftClosed ? "हाँ" : "नहीं"} | PM बंद: ${pmShiftClosed ? "हाँ" : "नहीं"}`
            )}
          </Text>
        ) : null}
        {stockTransferPendingLiters > 0 ? (
          isPrivileged ? (
            <Pressable
              onPress={() => void movePendingMilkToCurd()}
              disabled={syncingToCurd || stockTransferState === "AUTO_TRANSFERRED"}
              style={{
                marginTop: 8,
                alignSelf: "flex-start",
                borderRadius: 10,
                backgroundColor:
                  syncingToCurd || stockTransferState === "AUTO_TRANSFERRED"
                    ? DairyColors.textSecondary
                    : DairyColors.warning,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: "white", fontWeight: "800" }}>
                {syncingToCurd
                  ? x("Moving...", "ट्रांसफर हो रहा...")
                  : x("Move Milk to Curd", "दूध दही में डालें")}
              </Text>
            </Pressable>
          ) : (
            <Text style={{ marginTop: 6, color: DairyColors.textSecondary }}>
              {x(
                "Ask ADMIN/MANAGER to complete curd transfer.",
                "दही ट्रांसफर के लिए ADMIN/MANAGER से कहें।"
              )}
            </Text>
          )
        ) : null}
      </View>

      <View
        style={{
          marginTop: 12,
          borderWidth: 1,
          borderColor: DairyColors.border,
          borderRadius: 12,
          backgroundColor: pendingSync.total > 0 ? DairyColors.warningSoft : DairyColors.successSoft,
          padding: 10,
        }}
      >
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
          {pendingSync.total > 0 ? x("Offline Sync Pending", "ऑफलाइन सिंक बाकी") : x("All Synced", "सब सिंक")}
        </Text>
        <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
          {x(
            `Total ${pendingSync.total} | Status updates ${pendingSync.deliveryTaskStatus} | Add-ons ${pendingSync.deliveryAddOn} | Dead letter ${pendingSync.deadLetter}`,
            `कुल ${pendingSync.total} | स्टेटस अपडेट ${pendingSync.deliveryTaskStatus} | एक्स्ट्रा रिक्वेस्ट ${pendingSync.deliveryAddOn} | डेड लेटर ${pendingSync.deadLetter}`
          )}
        </Text>
        <Pressable
          onPress={() => void syncPending()}
          disabled={syncing}
          style={{
            marginTop: 8,
            alignSelf: "flex-start",
            borderRadius: 10,
            backgroundColor: syncing ? DairyColors.textSecondary : DairyColors.primary,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Text style={{ color: "white", fontWeight: "800" }}>
            {syncing ? x("Syncing...", "सिंक हो रहा है...") : x("Sync Pending Now", "अभी सिंक करें")}
          </Text>
        </Pressable>
      </View>

      <View
          style={{
            marginTop: 12,
            borderWidth: 1,
            borderColor: DairyColors.border,
            borderRadius: 12,
            backgroundColor: DairyColors.surface,
            padding: 10,
          }}
      >
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
          {x("Run Mode", "रन मोड")}
        </Text>
        <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
          {x(
            "Select route + shift and close run with cash/UPI totals.",
            "रूट + शिफ्ट चुनें और कैश/UPI टोटल के साथ रन बंद करें।"
          )}
        </Text>
        <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
          {x(
            `Current user: ${user?.username ?? "-"}`,
            `वर्तमान यूज़र: ${user?.username ?? "-"}`
          )}
        </Text>
        <Text
          style={{
            marginTop: 4,
            color:
              runMilkDeficitLiters > 0 || (runHasMilkStops && runShiftQcStatus !== "PASS")
                ? DairyColors.warning
                : DairyColors.textSecondary,
            fontWeight:
              runMilkDeficitLiters > 0 || (runHasMilkStops && runShiftQcStatus !== "PASS")
                ? "700"
                : "400",
          }}
        >
          {x(
            `Selected run pending milk ${runPendingMilkLiters.toFixed(2)} L | Stock ${runAvailableMilkLiters.toFixed(2)} L | QC ${qcLabel(runShiftQcStatus)}`,
            `चुने हुए रन का लंबित दूध ${runPendingMilkLiters.toFixed(2)} L | स्टॉक ${runAvailableMilkLiters.toFixed(2)} L | QC ${qcLabel(runShiftQcStatus)}`
          )}
        </Text>

        <Text style={{ marginTop: 8, color: DairyColors.textSecondary, fontWeight: "700" }}>
          {x("Route", "रूट")}
        </Text>
        <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {runRouteOptions.length === 0 ? (
            <Text style={{ color: DairyColors.textSecondary }}>
              {x("No routes available for current filters.", "वर्तमान फ़िल्टर के लिए कोई रूट उपलब्ध नहीं।")}
            </Text>
          ) : (
            runRouteOptions.map((route) => (
              <Pressable
                key={`run-route-${route}`}
                onPress={() => setRunRoute(route)}
                style={{
                  borderWidth: 1,
                  borderColor: runRoute === route ? DairyColors.primary : DairyColors.border,
                  backgroundColor: runRoute === route ? DairyColors.primarySoft : DairyColors.surface,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{route}</Text>
              </Pressable>
            ))
          )}
        </View>

        <Text style={{ marginTop: 8, color: DairyColors.textSecondary, fontWeight: "700" }}>
          {x("Run Shift", "रन शिफ्ट")}
        </Text>
        <View style={{ marginTop: 6, flexDirection: "row", gap: 8 }}>
          {(["AM", "PM"] as const).map((shift) => (
            <Pressable
              key={`run-shift-${shift}`}
              onPress={() => setRunShift(shift)}
              style={{
                borderWidth: 1,
                borderColor: runShift === shift ? DairyColors.primary : DairyColors.border,
                backgroundColor: runShift === shift ? DairyColors.primarySoft : DairyColors.surface,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                {label("shift", shift)}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={{ marginTop: 8, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Pressable
            onPress={startRun}
            disabled={!canStartRun}
            style={{
              borderRadius: 10,
              backgroundColor: canStartRun ? DairyColors.primary : DairyColors.textSecondary,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: "white", fontWeight: "800" }}>{x("Start Run", "रन शुरू करें")}</Text>
          </Pressable>
          {runActive ? (
            <Pressable
              onPress={() => void closeRun()}
              disabled={closureSaving}
              style={{
                borderRadius: 10,
                backgroundColor: closureSaving ? DairyColors.textSecondary : DairyColors.warning,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: "white", fontWeight: "800" }}>
                {closureSaving ? x("Closing...", "रन बंद हो रहा...") : x("Close Run", "रन बंद करें")}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {runStartBlock ? (
          <Text style={{ marginTop: 8, color: DairyColors.warning, fontWeight: "700" }}>
            {runStartBlock.body}
          </Text>
        ) : null}

        <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <View style={{ flex: 1, minWidth: 110, borderRadius: 10, backgroundColor: DairyColors.surfaceMuted, padding: 8 }}>
            <Text style={{ color: DairyColors.textSecondary }}>{x("Stops", "स्टॉप")}</Text>
            <Text style={{ marginTop: 3, color: DairyColors.textPrimary, fontWeight: "800" }}>
              {runSummary.totalStops}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 110, borderRadius: 10, backgroundColor: DairyColors.successSoft, padding: 8 }}>
            <Text style={{ color: DairyColors.textSecondary }}>{x("Delivered", "डिलीवर")}</Text>
            <Text style={{ marginTop: 3, color: DairyColors.textPrimary, fontWeight: "800" }}>
              {runSummary.deliveredStops}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 110, borderRadius: 10, backgroundColor: DairyColors.warningSoft, padding: 8 }}>
            <Text style={{ color: DairyColors.textSecondary }}>{x("Pending", "बाकी")}</Text>
            <Text style={{ marginTop: 3, color: DairyColors.textPrimary, fontWeight: "800" }}>
              {runSummary.pendingStops}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 110, borderRadius: 10, backgroundColor: DairyColors.infoSoft, padding: 8 }}>
            <Text style={{ color: DairyColors.textSecondary }}>{x("Delivered Qty", "डिलीवर मात्रा")}</Text>
            <Text style={{ marginTop: 3, color: DairyColors.textPrimary, fontWeight: "800" }}>
              {runSummary.deliveredQty.toFixed(2)}
            </Text>
          </View>
        </View>

        {runActive ? (
          <>
            <Text style={{ marginTop: 10, color: DairyColors.textSecondary }}>
              {x(
                `Expected collection: Rs ${runSummary.expectedCollection.toFixed(2)} (Cash Rs ${runSummary.expectedCash.toFixed(2)} | UPI Rs ${runSummary.expectedUpi.toFixed(2)} | Other Rs ${runSummary.expectedOther.toFixed(2)})`,
                `अपेक्षित कलेक्शन: रु ${runSummary.expectedCollection.toFixed(2)} (कैश रु ${runSummary.expectedCash.toFixed(2)} | UPI रु ${runSummary.expectedUpi.toFixed(2)} | अन्य रु ${runSummary.expectedOther.toFixed(2)})`
              )}
            </Text>

            <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
              <TextInput
                value={closureCash}
                onChangeText={setClosureCash}
                placeholder={x("Cash closure", "कैश क्लोजर")}
                placeholderTextColor="#99A99A"
                keyboardType="decimal-pad"
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  borderRadius: 10,
                  padding: 10,
                  color: DairyColors.textPrimary,
                  backgroundColor: DairyColors.surfaceMuted,
                }}
              />
              <TextInput
                value={closureUpi}
                onChangeText={setClosureUpi}
                placeholder={x("UPI closure", "UPI क्लोजर")}
                placeholderTextColor="#99A99A"
                keyboardType="decimal-pad"
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  borderRadius: 10,
                  padding: 10,
                  color: DairyColors.textPrimary,
                  backgroundColor: DairyColors.surfaceMuted,
                }}
              />
              <TextInput
                value={closureOther}
                onChangeText={setClosureOther}
                placeholder={x("Other closure", "अन्य क्लोजर")}
                placeholderTextColor="#99A99A"
                keyboardType="decimal-pad"
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  borderRadius: 10,
                  padding: 10,
                  color: DairyColors.textPrimary,
                  backgroundColor: DairyColors.surfaceMuted,
                }}
              />
            </View>

            <Text style={{ marginTop: 6, color: closureVariance === 0 ? DairyColors.success : DairyColors.warning }}>
              {x(
                `Actual Rs ${closureActual.toFixed(2)} | Variance Rs ${closureVariance.toFixed(2)}`,
                `वास्तविक रु ${closureActual.toFixed(2)} | अंतर रु ${closureVariance.toFixed(2)}`
              )}
            </Text>

            <TextInput
              value={closureNotes}
              onChangeText={setClosureNotes}
              placeholder={x("Run closure notes (optional)", "रन क्लोजर नोट्स (वैकल्पिक)")}
              placeholderTextColor="#99A99A"
              style={{
                marginTop: 8,
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 10,
                padding: 10,
                color: DairyColors.textPrimary,
                backgroundColor: DairyColors.surfaceMuted,
              }}
            />
          </>
        ) : null}
      </View>

      {runActive && runTasks.length > 0 ? (
        <View
          style={{
            marginTop: 12,
            borderWidth: 1,
            borderColor: DairyColors.border,
            borderRadius: 12,
            backgroundColor: DairyColors.surface,
            padding: 10,
          }}
        >
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
            {x("Run Checklist", "रन चेकलिस्ट")}
          </Text>
          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
            {x(
              `Route ${runRoute} | Shift ${runShift}`,
              `रूट ${runRoute} | शिफ्ट ${runShift}`
            )}
          </Text>
          {canBulkRunActions ? (
            <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Pressable
                disabled={bulkUpdatingRun || runSummary.pendingStops <= 0}
                onPress={() => void bulkUpdateRunPending("DELIVERED")}
                style={{
                  borderRadius: 10,
                  backgroundColor:
                    bulkUpdatingRun || runSummary.pendingStops <= 0
                      ? DairyColors.textSecondary
                      : DairyColors.success,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: "white", fontWeight: "800" }}>
                  {bulkUpdatingRun
                    ? x("Updating...", "अपडेट हो रहा...")
                    : x("Deliver All Pending", "सभी पेंडिंग डिलीवर")}
                </Text>
              </Pressable>
              <Pressable
                disabled={bulkUpdatingRun || runSummary.pendingStops <= 0}
                onPress={() => void bulkUpdateRunPending("SKIPPED")}
                style={{
                  borderRadius: 10,
                  backgroundColor:
                    bulkUpdatingRun || runSummary.pendingStops <= 0
                      ? DairyColors.textSecondary
                      : DairyColors.warning,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: "white", fontWeight: "800" }}>
                  {x("Skip All Pending", "सभी पेंडिंग स्किप")}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {runTasks.map((task) => {
            const tone = statusTone(task.status);
            const sla = slaTone(task);
            const canAct = canActOnTask(task);
            return (
              <View
                key={`run-${task.deliveryTaskId}`}
                style={{
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  borderRadius: 10,
                  backgroundColor: DairyColors.surfaceMuted,
                  padding: 10,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>{task.customerName}</Text>
                  <View style={{ borderRadius: 999, backgroundColor: tone.bg, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ color: tone.text, fontWeight: "700" }}>{task.status}</Text>
                  </View>
                </View>
                <Text style={{ marginTop: 3, color: DairyColors.textSecondary }}>
                  {label("productType", task.productType ?? "MILK")} | {task.plannedQtyLiters.toFixed(2)} | {x("Mode", "मोड")} {label("paymentMode", task.paymentMode)}
                </Text>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x(
                    `Stop ${task.optimizedStopOrder ?? "-"} | ETA ${task.plannedEta ?? "-"} | SLA ${task.slaDueTime ?? "-"}`,
                    `स्टॉप ${task.optimizedStopOrder ?? "-"} | ETA ${task.plannedEta ?? "-"} | SLA ${task.slaDueTime ?? "-"}`
                  )}
                </Text>
                <View
                  style={{
                    marginTop: 4,
                    alignSelf: "flex-start",
                    borderRadius: 999,
                    backgroundColor: sla.bg,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={{ color: sla.text, fontWeight: "700" }}>
                    {task.status === "DELIVERED"
                      ? task.slaBreached
                        ? x(
                            `SLA Breached (+${task.slaDelayMinutes ?? 0}m)`,
                            `SLA लेट (+${task.slaDelayMinutes ?? 0}मि)`
                          )
                        : x("SLA On Time", "SLA समय पर")
                      : x("SLA Tracking Active", "SLA ट्रैकिंग चालू")}
                  </Text>
                </View>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x(
                    `Assigned: ${task.assignedToUsername?.trim() || "Unassigned"}`,
                    `असाइन: ${task.assignedToUsername?.trim() || "अनअसाइन्ड"}`
                  )}
                </Text>
                <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
                  <TextInput
                    value={runCollectedByTaskId[task.deliveryTaskId] ?? ""}
                    onChangeText={(value) =>
                      setRunCollectedByTaskId((prev) => ({ ...prev, [task.deliveryTaskId]: value }))
                    }
                    editable={canAct}
                    placeholder={x("Collected amount", "कलेक्शन राशि")}
                    placeholderTextColor="#99A99A"
                    keyboardType="decimal-pad"
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: DairyColors.border,
                      borderRadius: 10,
                      padding: 10,
                      color: DairyColors.textPrimary,
                      backgroundColor: canAct ? DairyColors.surface : DairyColors.surfaceMuted,
                    }}
                  />
                  <TextInput
                    value={runNoteByTaskId[task.deliveryTaskId] ?? ""}
                    onChangeText={(value) =>
                      setRunNoteByTaskId((prev) => ({ ...prev, [task.deliveryTaskId]: value }))
                    }
                    editable={canAct}
                    placeholder={x("Note (optional)", "नोट (वैकल्पिक)")}
                    placeholderTextColor="#99A99A"
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: DairyColors.border,
                      borderRadius: 10,
                      padding: 10,
                      color: DairyColors.textPrimary,
                      backgroundColor: canAct ? DairyColors.surface : DairyColors.surfaceMuted,
                    }}
                  />
                </View>

                <View style={{ marginTop: 8, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {canClaimTask(task) ? (
                    <Pressable
                      disabled={taskBusy(task.deliveryTaskId)}
                      onPress={() =>
                        void claimTask(task, runNoteByTaskId[task.deliveryTaskId] ?? null)
                      }
                      style={{
                        borderRadius: 10,
                        backgroundColor: DairyColors.info,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                      }}
                    >
                      <Text style={{ color: "white", fontWeight: "800" }}>{x("Claim Task", "टास्क लें")}</Text>
                    </Pressable>
                  ) : null}
                  {canAct ? (
                    <>
                      <Pressable
                        disabled={taskBusy(task.deliveryTaskId)}
                        onPress={() =>
                          void updateTaskStatus(task, "DELIVERED", {
                            collectedAmountText: runCollectedByTaskId[task.deliveryTaskId] ?? "",
                            notes: runNoteByTaskId[task.deliveryTaskId] ?? null,
                          })
                        }
                        style={{
                          borderRadius: 10,
                          backgroundColor: DairyColors.success,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                        }}
                      >
                        <Text style={{ color: "white", fontWeight: "800" }}>{x("Delivered", "डिलीवर")}</Text>
                      </Pressable>
                      <Pressable
                        disabled={taskBusy(task.deliveryTaskId)}
                        onPress={() =>
                          void updateTaskStatus(task, "SKIPPED", {
                            notes: runNoteByTaskId[task.deliveryTaskId] ?? null,
                          })
                        }
                        style={{
                          borderRadius: 10,
                          backgroundColor: DairyColors.warning,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                        }}
                      >
                        <Text style={{ color: "white", fontWeight: "800" }}>{x("Skipped", "स्किप")}</Text>
                      </Pressable>
                      <Pressable
                        disabled={taskBusy(task.deliveryTaskId)}
                        onPress={() =>
                          void updateTaskStatus(task, "PENDING", {
                            notes: runNoteByTaskId[task.deliveryTaskId] ?? null,
                          })
                        }
                        style={{
                          borderRadius: 10,
                          backgroundColor: DairyColors.textSecondary,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                        }}
                      >
                        <Text style={{ color: "white", fontWeight: "800" }}>{x("Pending", "बाकी")}</Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
                {!canAct ? (
                  <Text style={{ marginTop: 6, color: DairyColors.textSecondary }}>
                    {x("Read only: this stop is assigned to another user.", "रीड-ओनली: यह स्टॉप किसी और यूज़र को असाइन है।")}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {isPrivileged && latestClosure ? (
        <View
          style={{
            marginTop: 12,
            borderWidth: 1,
            borderColor: DairyColors.border,
            borderRadius: 12,
            backgroundColor: DairyColors.surface,
            padding: 10,
          }}
        >
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
            {x("Last Run Closure", "आखिरी रन क्लोजर")}
          </Text>
          <Text style={{ marginTop: 3, color: DairyColors.textSecondary }}>
            {x(
              `${latestClosure.date} | ${latestClosure.routeName} | ${label("shift", latestClosure.shift)}`,
              `${latestClosure.date} | ${latestClosure.routeName} | ${label("shift", latestClosure.shift)}`
            )}
          </Text>
          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
            {x(
              `Closed by ${latestClosure.closedBy} at ${latestClosure.closedAt}`,
              `${latestClosure.closedBy} द्वारा बंद: ${latestClosure.closedAt}`
            )}
          </Text>
          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
            {x(
              `Stops ${latestClosure.totalStops} | Delivered ${latestClosure.deliveredStops} | Pending ${latestClosure.pendingStops} | Skipped ${latestClosure.skippedStops}`,
              `स्टॉप ${latestClosure.totalStops} | डिलीवर ${latestClosure.deliveredStops} | बाकी ${latestClosure.pendingStops} | स्किप ${latestClosure.skippedStops}`
            )}
          </Text>
          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
            {x(
              `Expected Rs ${latestClosure.expectedCollection.toFixed(2)} | Actual Rs ${latestClosure.actualCollection.toFixed(2)} | Variance Rs ${latestClosure.variance.toFixed(2)}`,
              `अपेक्षित रु ${latestClosure.expectedCollection.toFixed(2)} | वास्तविक रु ${latestClosure.actualCollection.toFixed(2)} | अंतर रु ${latestClosure.variance.toFixed(2)}`
            )}
          </Text>
          {latestClosure.stockTransferState ? (
            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
              {x(
                `Stock ${latestClosure.stockTransferState} | Pending ${(latestClosure.pendingMilkToCurdLiters ?? 0).toFixed(2)} L`,
                `स्टॉक ${latestClosure.stockTransferState} | लंबित ${(latestClosure.pendingMilkToCurdLiters ?? 0).toFixed(2)} L`
              )}
            </Text>
          ) : null}
          {latestClosure.stockAlertMessage ? (
            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>{latestClosure.stockAlertMessage}</Text>
          ) : null}
          {latestClosure.notes ? (
            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
              {x("Notes", "नोट्स")}: {latestClosure.notes}
            </Text>
          ) : null}
        </View>
      ) : null}

      {isPrivileged && runClosures.length > 0 ? (
        <View
          style={{
            marginTop: 12,
            borderWidth: 1,
            borderColor: DairyColors.border,
            borderRadius: 12,
            backgroundColor: DairyColors.surface,
            padding: 10,
          }}
        >
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
            {x("Closure Summary (Date)", "क्लोजर सारांश (तारीख)")}
          </Text>
          <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <View style={{ flex: 1, minWidth: 110, borderRadius: 10, backgroundColor: DairyColors.surfaceMuted, padding: 8 }}>
              <Text style={{ color: DairyColors.textSecondary }}>{x("Runs", "रन")}</Text>
              <Text style={{ marginTop: 3, color: DairyColors.textPrimary, fontWeight: "800" }}>{closureSummary.totalRuns}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 110, borderRadius: 10, backgroundColor: DairyColors.successSoft, padding: 8 }}>
              <Text style={{ color: DairyColors.textSecondary }}>{x("Delivered Stops", "डिलीवर स्टॉप")}</Text>
              <Text style={{ marginTop: 3, color: DairyColors.textPrimary, fontWeight: "800" }}>{closureSummary.totalDelivered}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 110, borderRadius: 10, backgroundColor: DairyColors.infoSoft, padding: 8 }}>
              <Text style={{ color: DairyColors.textSecondary }}>{x("Expected Rs", "अपेक्षित रु")}</Text>
              <Text style={{ marginTop: 3, color: DairyColors.textPrimary, fontWeight: "800" }}>
                {closureSummary.totalExpected.toFixed(2)}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 110, borderRadius: 10, backgroundColor: DairyColors.warningSoft, padding: 8 }}>
              <Text style={{ color: DairyColors.textSecondary }}>{x("Actual Rs", "वास्तविक रु")}</Text>
              <Text style={{ marginTop: 3, color: DairyColors.textPrimary, fontWeight: "800" }}>
                {closureSummary.totalActual.toFixed(2)}
              </Text>
            </View>
          </View>
          <Text
            style={{
              marginTop: 8,
              color: closureSummary.totalVariance === 0 ? DairyColors.success : DairyColors.warning,
              fontWeight: "700",
            }}
          >
            {x(
              `Variance (date total): Rs ${closureSummary.totalVariance.toFixed(2)} | Stops ${closureSummary.totalDelivered}/${closureSummary.totalStops}`,
              `अंतर (दिन कुल): रु ${closureSummary.totalVariance.toFixed(2)} | स्टॉप ${closureSummary.totalDelivered}/${closureSummary.totalStops}`
            )}
          </Text>

          <Text style={{ marginTop: 10, color: DairyColors.textPrimary, fontWeight: "800" }}>
            {x("Run Closure History", "रन क्लोजर इतिहास")}
          </Text>
          {runClosures.map((row) => (
            <View
              key={row.runClosureId}
              style={{
                marginTop: 8,
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 10,
                backgroundColor: DairyColors.surfaceMuted,
                padding: 10,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                {row.routeName} | {label("shift", row.shift)}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x(
                  `By ${row.closedBy} at ${row.closedAt}`,
                  `${row.closedBy} द्वारा ${row.closedAt}`
                )}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x(
                  `Stops ${row.totalStops} | Delivered ${row.deliveredStops} | Pending ${row.pendingStops} | Skipped ${row.skippedStops}`,
                  `स्टॉप ${row.totalStops} | डिलीवर ${row.deliveredStops} | बाकी ${row.pendingStops} | स्किप ${row.skippedStops}`
                )}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x(
                  `Expected Rs ${row.expectedCollection.toFixed(2)} | Actual Rs ${row.actualCollection.toFixed(2)} | Variance Rs ${row.variance.toFixed(2)}`,
                  `अपेक्षित रु ${row.expectedCollection.toFixed(2)} | वास्तविक रु ${row.actualCollection.toFixed(2)} | अंतर रु ${row.variance.toFixed(2)}`
                )}
              </Text>
              {row.notes ? (
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x("Notes", "नोट्स")}: {row.notes}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {canCreateAddOn ? (
        <View
        style={{
          marginTop: 12,
          borderWidth: 1,
          borderColor: DairyColors.border,
          borderRadius: 12,
          backgroundColor: DairyColors.surface,
          padding: 10,
        }}
      >
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
          {x("Add-on Delivery Request", "एक्स्ट्रा डिलीवरी रिक्वेस्ट")}
        </Text>
        <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
          {x(
            "Use this for extra customer demand. Same stop/shift/product/time gets merged automatically.",
            "इसे ग्राहक की एक्स्ट्रा मांग के लिए उपयोग करें। एक ही स्टॉप/शिफ्ट/प्रोडक्ट/समय होने पर रिकॉर्ड मर्ज हो जाएगा।"
          )}
        </Text>

        {customerOptions.length > 0 ? (
          <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {customerOptions.slice(0, 14).map((row) => {
              const selected = addOnCustomerId === row.customerId;
              return (
                <Pressable
                  key={row.customerId}
                  onPress={() => {
                    setAddOnCustomerId(row.customerId);
                    setAddOnCustomerName(row.customerName);
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? DairyColors.primary : DairyColors.border,
                    backgroundColor: selected ? DairyColors.primarySoft : DairyColors.surfaceMuted,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                  }}
                >
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{row.customerName}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <TextInput
          value={addOnCustomerName}
          onChangeText={(value) => {
            setAddOnCustomerName(value);
            setAddOnCustomerId(null);
          }}
          placeholder={x("Customer name (or select above)", "ग्राहक नाम (ऊपर से चुनें)")}
          placeholderTextColor="#99A99A"
          style={{
            marginTop: 8,
            borderWidth: 1,
            borderColor: DairyColors.border,
            borderRadius: 10,
            padding: 10,
            color: DairyColors.textPrimary,
            backgroundColor: DairyColors.surfaceMuted,
          }}
        />

        <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(["AM", "PM"] as const).map((shift) => (
            <Pressable
              key={shift}
              onPress={() => setAddOnShift(shift)}
              style={{
                borderWidth: 1,
                borderColor: addOnShift === shift ? DairyColors.primary : DairyColors.border,
                backgroundColor: addOnShift === shift ? DairyColors.primarySoft : DairyColors.surface,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{label("shift", shift)}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {ADDON_PRODUCTS.map((product) => (
            <Pressable
              key={product}
              onPress={() => setAddOnProductType(product)}
              style={{
                borderWidth: 1,
                borderColor: addOnProductType === product ? DairyColors.primary : DairyColors.border,
                backgroundColor: addOnProductType === product ? DairyColors.primarySoft : DairyColors.surface,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 7,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{label("productType", product)}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
          <TextInput
            value={addOnQty}
            onChangeText={setAddOnQty}
            placeholder={x("Extra Qty", "एक्स्ट्रा मात्रा")}
            placeholderTextColor="#99A99A"
            keyboardType="decimal-pad"
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: DairyColors.border,
              borderRadius: 10,
              padding: 10,
              color: DairyColors.textPrimary,
              backgroundColor: DairyColors.surfaceMuted,
            }}
          />
          <TextInput
            value={addOnUnitPrice}
            onChangeText={setAddOnUnitPrice}
            placeholder={x("Unit Price (opt)", "यूनिट कीमत (वैकल्पिक)")}
            placeholderTextColor="#99A99A"
            keyboardType="decimal-pad"
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: DairyColors.border,
              borderRadius: 10,
              padding: 10,
              color: DairyColors.textPrimary,
              backgroundColor: DairyColors.surfaceMuted,
            }}
          />
        </View>

        <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
          <TextInput
            value={addOnPreferredTime}
            onChangeText={setAddOnPreferredTime}
            placeholder={x("Preferred time HH:mm", "पसंदीदा समय HH:mm")}
            placeholderTextColor="#99A99A"
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: DairyColors.border,
              borderRadius: 10,
              padding: 10,
              color: DairyColors.textPrimary,
              backgroundColor: DairyColors.surfaceMuted,
            }}
          />
          {selectedCustomer?.routeName ? (
            <View
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 10,
                padding: 10,
                backgroundColor: DairyColors.surfaceMuted,
                justifyContent: "center",
              }}
            >
              <Text style={{ color: DairyColors.textSecondary }}>
                {x("Route", "रूट")}: {selectedCustomer.routeName}
              </Text>
            </View>
          ) : null}
        </View>

        <TextInput
          value={addOnNotes}
          onChangeText={setAddOnNotes}
          placeholder={x("Notes (optional)", "नोट्स (वैकल्पिक)")}
          placeholderTextColor="#99A99A"
          style={{
            marginTop: 8,
            borderWidth: 1,
            borderColor: DairyColors.border,
            borderRadius: 10,
            padding: 10,
            color: DairyColors.textPrimary,
            backgroundColor: DairyColors.surfaceMuted,
          }}
        />

        <Pressable
          disabled={addOnSaving}
          onPress={() => void saveAddOn()}
          style={{
            marginTop: 8,
            borderRadius: 10,
            backgroundColor: addOnSaving ? DairyColors.textSecondary : DairyColors.primary,
            paddingVertical: 11,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "800" }}>
            {addOnSaving ? x("Saving...", "सेव हो रहा है...") : x("Add Extra Request", "एक्स्ट्रा रिक्वेस्ट जोड़ें")}
          </Text>
        </Pressable>
        </View>
      ) : null}

      {grouped.map((group) => (
        <View
          key={group.routeName}
          style={{
            marginTop: 12,
            borderWidth: 1,
            borderColor: DairyColors.border,
            borderRadius: 12,
            backgroundColor: DairyColors.surface,
            padding: 10,
          }}
        >
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
            {group.routeName}
          </Text>

          {group.items.map((task) => {
            const tone = statusTone(task.status);
            const sla = slaTone(task);
            const productType = task.productType ?? "MILK";
            const canAct = canActOnTask(task);
            return (
              <View
                key={task.deliveryTaskId}
                style={{
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  borderRadius: 10,
                  backgroundColor: DairyColors.surfaceMuted,
                  padding: 10,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>{task.customerName}</Text>
                  <View style={{ borderRadius: 999, backgroundColor: tone.bg, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ color: tone.text, fontWeight: "700" }}>{task.status}</Text>
                  </View>
                </View>
                <Text style={{ marginTop: 3, color: DairyColors.textSecondary }}>
                  {label("productType", productType)} | {task.plannedQtyLiters.toFixed(2)} |{" "}
                  {x(`Shift ${task.taskShift ?? "AM"}`, `शिफ्ट ${task.taskShift ?? "AM"}`)}
                  {task.preferredTime ? ` | ${x("Time", "समय")} ${task.preferredTime}` : ""}
                </Text>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x(
                    `Stop ${task.optimizedStopOrder ?? "-"} | ETA ${task.plannedEta ?? "-"} | SLA ${task.slaDueTime ?? "-"}`,
                    `स्टॉप ${task.optimizedStopOrder ?? "-"} | ETA ${task.plannedEta ?? "-"} | SLA ${task.slaDueTime ?? "-"}`
                  )}
                </Text>
                <View
                  style={{
                    marginTop: 4,
                    alignSelf: "flex-start",
                    borderRadius: 999,
                    backgroundColor: sla.bg,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={{ color: sla.text, fontWeight: "700" }}>
                    {task.status === "DELIVERED"
                      ? task.slaBreached
                        ? x(
                            `SLA Breached (+${task.slaDelayMinutes ?? 0}m)`,
                            `SLA लेट (+${task.slaDelayMinutes ?? 0}मि)`
                          )
                        : x("SLA On Time", "SLA समय पर")
                      : x("SLA Tracking Active", "SLA ट्रैकिंग चालू")}
                  </Text>
                </View>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x(
                    `Assigned: ${task.assignedToUsername?.trim() || "Unassigned"}`,
                    `असाइन: ${task.assignedToUsername?.trim() || "अनअसाइन्ड"}`
                  )}
                </Text>
                {isPrivileged && task.status !== "DELIVERED" ? (
                  <View style={{ marginTop: 6 }}>
                    <Pressable
                      disabled={taskBusy(task.deliveryTaskId)}
                      onPress={() =>
                        setAssigneePickerTaskId((prev) =>
                          prev === task.deliveryTaskId ? null : task.deliveryTaskId
                        )
                      }
                      style={{
                        alignSelf: "flex-start",
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: DairyColors.border,
                        backgroundColor: DairyColors.surface,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      }}
                    >
                      <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                        {assigneePickerTaskId === task.deliveryTaskId
                          ? x("Close Reassign", "रीअसाइन बंद")
                          : x("Reassign", "रीअसाइन")}
                      </Text>
                    </Pressable>
                    {assigneePickerTaskId === task.deliveryTaskId ? (
                      <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        <Pressable
                          disabled={taskBusy(task.deliveryTaskId)}
                          onPress={() => void assignTaskOwner(task, null)}
                          style={{
                            borderWidth: 1,
                            borderColor:
                              !task.assignedToUsername?.trim() ? DairyColors.primary : DairyColors.border,
                            backgroundColor:
                              !task.assignedToUsername?.trim() ? DairyColors.primarySoft : DairyColors.surface,
                            borderRadius: 999,
                            paddingHorizontal: 10,
                            paddingVertical: 7,
                          }}
                        >
                          <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                            {x("Unassigned", "अनअसाइन्ड")}
                          </Text>
                        </Pressable>
                        {deliveryUsers.map((userRow) => {
                          const selected =
                            (task.assignedToUsername ?? "").toLowerCase() ===
                            userRow.username.toLowerCase();
                          return (
                            <Pressable
                              key={`assign-${task.deliveryTaskId}-${userRow.userId}`}
                              disabled={taskBusy(task.deliveryTaskId)}
                              onPress={() => void assignTaskOwner(task, userRow.username)}
                              style={{
                                borderWidth: 1,
                                borderColor: selected ? DairyColors.primary : DairyColors.border,
                                backgroundColor: selected ? DairyColors.primarySoft : DairyColors.surface,
                                borderRadius: 999,
                                paddingHorizontal: 10,
                                paddingVertical: 7,
                              }}
                            >
                              <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                                {userRow.username}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                ) : null}
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x(
                    `Unit Rs ${task.unitPrice.toFixed(2)} | Delivered ${(task.deliveredQtyLiters ?? 0).toFixed(2)}`,
                    `यूनिट रु ${task.unitPrice.toFixed(2)} | डिलीवर ${(task.deliveredQtyLiters ?? 0).toFixed(2)}`
                  )}
                </Text>

                <View style={{ marginTop: 8, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {canClaimTask(task) ? (
                    <Pressable
                      disabled={taskBusy(task.deliveryTaskId)}
                      onPress={() => void claimTask(task)}
                      style={{
                        borderRadius: 10,
                        backgroundColor: DairyColors.info,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                      }}
                    >
                      <Text style={{ color: "white", fontWeight: "800" }}>{x("Claim Task", "टास्क लें")}</Text>
                    </Pressable>
                  ) : null}
                  {canAct ? (
                    <>
                      <Pressable
                        disabled={taskBusy(task.deliveryTaskId)}
                        onPress={() => void updateTaskStatus(task, "DELIVERED")}
                        style={{
                          borderRadius: 10,
                          backgroundColor: DairyColors.success,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                        }}
                      >
                        <Text style={{ color: "white", fontWeight: "800" }}>
                          {x("Delivered", "डिलीवर")}
                        </Text>
                      </Pressable>
                      <Pressable
                        disabled={taskBusy(task.deliveryTaskId)}
                        onPress={() => void updateTaskStatus(task, "SKIPPED")}
                        style={{
                          borderRadius: 10,
                          backgroundColor: DairyColors.warning,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                        }}
                      >
                        <Text style={{ color: "white", fontWeight: "800" }}>{x("Skipped", "स्किप")}</Text>
                      </Pressable>
                      <Pressable
                        disabled={taskBusy(task.deliveryTaskId)}
                        onPress={() => void updateTaskStatus(task, "PENDING")}
                        style={{
                          borderRadius: 10,
                          backgroundColor: DairyColors.textSecondary,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                        }}
                      >
                        <Text style={{ color: "white", fontWeight: "800" }}>{x("Pending", "बाकी")}</Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
                {!canAct ? (
                  <Text style={{ marginTop: 6, color: DairyColors.textSecondary }}>
                    {x("Read only: this stop is assigned to another user.", "रीड-ओनली: यह स्टॉप किसी और यूज़र को असाइन है।")}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}

      {canViewTeamReconciliation ? (
        <View
        style={{
          marginTop: 14,
          borderWidth: 1,
          borderColor: DairyColors.border,
          borderRadius: 12,
          backgroundColor: DairyColors.surface,
          padding: 10,
        }}
      >
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
          {x("EOD Reconciliation by Delivery User", "डिलीवरी यूज़र के हिसाब से दिन का मिलान")}
        </Text>
        {rows.length === 0 ? (
          <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
            {x("No reconciliation rows for this date.", "इस तारीख के लिए कोई मिलान रिकॉर्ड नहीं है।")}
          </Text>
        ) : (
          rows.map((row) => (
            <View
              key={row.deliveryUsername}
              style={{
                marginTop: 8,
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 10,
                backgroundColor: DairyColors.surfaceMuted,
                padding: 10,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>{row.deliveryUsername}</Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x(
                  `Stops ${row.assignedTasks} | Delivered ${row.deliveredTasks} | Pending ${row.pendingTasks} | Skipped ${row.skippedTasks}`,
                  `स्टॉप ${row.assignedTasks} | डिलीवर ${row.deliveredTasks} | बाकी ${row.pendingTasks} | स्किप ${row.skippedTasks}`
                )}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x(
                  `Planned ${row.plannedQty.toFixed(2)} | Delivered ${row.deliveredQty.toFixed(2)}`,
                  `योजना ${row.plannedQty.toFixed(2)} | डिलीवर ${row.deliveredQty.toFixed(2)}`
                )}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x(
                  `Collected Rs ${row.collectedAmount.toFixed(2)} | Pending Rs ${row.pendingAmount.toFixed(2)}`,
                  `वसूली रु ${row.collectedAmount.toFixed(2)} | बाकी रु ${row.pendingAmount.toFixed(2)}`
                )}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x(
                  `SLA On-time ${row.onTimeDeliveredTasks} | Breached ${row.slaBreachedDeliveredTasks} | Avg delay ${row.avgDelayMinutesForDelivered.toFixed(1)}m`,
                  `SLA समय पर ${row.onTimeDeliveredTasks} | लेट ${row.slaBreachedDeliveredTasks} | औसत देरी ${row.avgDelayMinutesForDelivered.toFixed(1)}मि`
                )}
              </Text>
            </View>
          ))
        )}
        </View>
      ) : null}
    </ScrollView>
  );
}
