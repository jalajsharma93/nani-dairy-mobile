import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  AuthApi,
  AuthUserResponse,
  CustomerApi,
  CustomerRecordResponse,
  DeliveryReconciliationRowResponse,
  DeliveryRunClosureResponse,
  DeliveryTaskApi,
  DeliveryTaskResponse,
  DeliveryTaskStatus,
  ProductType,
  SubscriptionGenerationPreviewResponse,
  Shift,
  UpdateDeliveryTaskStatusPayload,
} from "../../services/api";
import { DairyColors } from "../../constants/dairy-theme";
import { todayLocalISO } from "../../utils/date";
import {
  flushPendingSyncOperations,
  getPendingSyncSummary,
  PendingSyncSummary,
  queueDeliveryAddOn,
  queueDeliveryTaskStatus,
  shouldQueueForOffline,
} from "../../utils/offline-sync";
import { useAuth } from "../../state/auth";
import { useI18n } from "../../state/i18n";

function routeKey(routeName?: string | null) {
  const route = routeName?.trim();
  return route && route.length > 0 ? route : "Unassigned Route";
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
  DAY_NOT_IN_ACTIVE_DAYS: { en: "Day not in active days", hi: "दिन सक्रिय दिनों में नहीं है" },
  LINE_QTY_NOT_POSITIVE: { en: "Line quantity is zero/negative", hi: "लाइन मात्रा शून्य/नकारात्मक है" },
  LINE_UNIT_PRICE_NOT_POSITIVE: { en: "Line price is zero/negative", hi: "लाइन कीमत शून्य/नकारात्मक है" },
  LEGACY_QTY_NOT_POSITIVE: { en: "Legacy quantity is zero/negative", hi: "लीगेसी मात्रा शून्य/नकारात्मक है" },
  LEGACY_UNIT_PRICE_NOT_POSITIVE: { en: "Legacy price is zero/negative", hi: "लीगेसी कीमत शून्य/नकारात्मक है" },
  UNKNOWN: { en: "Unknown reason", hi: "अज्ञात कारण" },
};

function normalizePreviewReason(reason?: string | null) {
  const key = (reason ?? "UNKNOWN").trim().toUpperCase();
  return key.length > 0 ? key : "UNKNOWN";
}

export default function DeliveryOpsScreen() {
  const { user, hasAnyRole } = useAuth();
  const { x, label } = useI18n();
  const canAccess = hasAnyRole("ADMIN", "MANAGER", "DELIVERY");
  const isPrivileged = hasAnyRole("ADMIN", "MANAGER");

  const [date, setDate] = useState(todayLocalISO());
  const [shiftFilter, setShiftFilter] = useState<Shift | "ALL">("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [generatingSubscriptions, setGeneratingSubscriptions] = useState(false);
  const [previewingSubscriptions, setPreviewingSubscriptions] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
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
  const [subscriptionPreview, setSubscriptionPreview] = useState<SubscriptionGenerationPreviewResponse | null>(null);

  const refreshPendingSync = useCallback(async () => {
    setPendingSync(await getPendingSyncSummary());
  }, []);

  const load = useCallback(async () => {
    if (!canAccess) {
      setTasks([]);
      setRows([]);
      setRunClosures([]);
      setSubscriptionPreview(null);
      return;
    }
    try {
      setLoading(true);
      const [taskRows, reconRows, closureRows] = await Promise.all([
        DeliveryTaskApi.list({ date }),
        DeliveryTaskApi.reconciliation(date),
        DeliveryTaskApi.listRunClosures(date),
      ]);
      setTasks(taskRows);
      setRows(reconRows);
      setRunClosures(closureRows);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load delivery operations.", "डिलीवरी ऑपरेशन डेटा लोड नहीं हुआ।")
      );
    } finally {
      setLoading(false);
    }
  }, [canAccess, date, x]);

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

  const byAssignee = useMemo(() => {
    if (!isPrivileged || assigneeFilter === "ALL") {
      return tasks;
    }
    if (assigneeFilter === "UNASSIGNED") {
      return tasks.filter((task) => !task.assignedToUsername);
    }
    return tasks.filter(
      (task) => (task.assignedToUsername ?? "").toLowerCase() === assigneeFilter.toLowerCase()
    );
  }, [assigneeFilter, isPrivileged, tasks]);

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
        items: [...items].sort((a, b) => {
          const t1 = a.preferredTime ?? "";
          const t2 = b.preferredTime ?? "";
          if (t1 !== t2) return t1.localeCompare(t2);
          return a.customerName.localeCompare(b.customerName);
        }),
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

  const runTasks = useMemo(
    () =>
      byAssignee.filter(
        (task) =>
          routeKey(task.routeName) === runRoute &&
          (task.taskShift ?? "AM") === runShift
      ),
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
      const generated = await DeliveryTaskApi.generateSubscriptions(date);
      await load();
      Alert.alert(
        x("Plan generated", "प्लान तैयार"),
        x(
          `Subscription tasks ready for ${date}. Rows: ${generated.length}`,
          `${date} के लिए सब्सक्रिप्शन टास्क तैयार। पंक्तियां: ${generated.length}`
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

  const canClaimTask = (task: DeliveryTaskResponse) => {
    const currentAssignee = task.assignedToUsername?.trim();
    return !isPrivileged && !currentAssignee && task.status === "PENDING";
  };

  const taskBusy = (deliveryTaskId: string) =>
    savingTaskId === deliveryTaskId || assigningTaskId === deliveryTaskId;

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

    const payload: UpdateDeliveryTaskStatusPayload = {
      status,
      deliveredQtyLiters:
        status === "DELIVERED"
          ? task.deliveredQtyLiters ?? task.plannedQtyLiters
          : task.deliveredQtyLiters ?? null,
      collectedAmount: parsedCollectedAmount,
      notes: options?.notes?.trim() || null,
    };

    try {
      setSavingTaskId(task.deliveryTaskId);
      await DeliveryTaskApi.updateStatus(task.deliveryTaskId, payload);
      setRunCollectedByTaskId((prev) => ({ ...prev, [task.deliveryTaskId]: "" }));
      await load();
    } catch (e: any) {
      console.error(e);
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

  const startRun = () => {
    if (!runRoute) {
      Alert.alert(
        x("Missing route", "रूट नहीं चुना"),
        x("Select route before starting run mode.", "रन मोड शुरू करने से पहले रूट चुनें।")
      );
      return;
    }
    if (runTasks.length === 0) {
      Alert.alert(
        x("No tasks", "कोई टास्क नहीं"),
        x("No delivery tasks for selected route and shift.", "चुने हुए रूट और शिफ्ट के लिए कोई डिलीवरी टास्क नहीं है।")
      );
      return;
    }
    setRunActive(true);
  };

  const closeRun = async () => {
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

      Alert.alert(
        x("Run closed", "रन बंद"),
        x(
          `Delivered ${saved.deliveredStops}/${saved.totalStops} | Pending ${saved.pendingStops} | Expected Rs ${saved.expectedCollection.toFixed(
            2
          )} | Actual Rs ${saved.actualCollection.toFixed(2)} | Variance Rs ${saved.variance.toFixed(2)}`,
          `डिलीवर ${saved.deliveredStops}/${saved.totalStops} | बाकी ${saved.pendingStops} | अपेक्षित रु ${saved.expectedCollection.toFixed(
            2
          )} | वास्तविक रु ${saved.actualCollection.toFixed(2)} | अंतर रु ${saved.variance.toFixed(2)}`
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

      <TextInput
        value={date}
        onChangeText={setDate}
        placeholder={x("Date (YYYY-MM-DD)", "तारीख (YYYY-MM-DD)")}
        placeholderTextColor="#99A99A"
        style={{
          marginTop: 12,
          borderWidth: 1,
          borderColor: DairyColors.border,
          borderRadius: 10,
          padding: 10,
          color: DairyColors.textPrimary,
          backgroundColor: DairyColors.surface,
        }}
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
          <Text style={{ color: DairyColors.textSecondary, paddingTop: 9 }}>
            {x(
              "Use this once per day before assigning/starting route runs.",
              "रूट रन शुरू करने/असाइन करने से पहले दिन में एक बार यह चलाएं।"
            )}
          </Text>
        </View>
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
            style={{
              borderRadius: 10,
              backgroundColor: DairyColors.primary,
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

          {runTasks.map((task) => {
            const tone = statusTone(task.status);
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
                      backgroundColor: DairyColors.surface,
                    }}
                  />
                  <TextInput
                    value={runNoteByTaskId[task.deliveryTaskId] ?? ""}
                    onChangeText={(value) =>
                      setRunNoteByTaskId((prev) => ({ ...prev, [task.deliveryTaskId]: value }))
                    }
                    placeholder={x("Note (optional)", "नोट (वैकल्पिक)")}
                    placeholderTextColor="#99A99A"
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: DairyColors.border,
                      borderRadius: 10,
                      padding: 10,
                      color: DairyColors.textPrimary,
                      backgroundColor: DairyColors.surface,
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
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {latestClosure ? (
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
          {latestClosure.notes ? (
            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
              {x("Notes", "नोट्स")}: {latestClosure.notes}
            </Text>
          ) : null}
        </View>
      ) : null}

      {runClosures.length > 0 ? (
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
            const productType = task.productType ?? "MILK";
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
                </View>
              </View>
            );
          })}
        </View>
      ))}

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
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
