import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { DairyColors } from "@/src/constants/dairy-theme";
import {
  CreateGenericTaskTemplatePayload,
  DeliveryTaskApi,
  DeliveryTaskResponse,
  DeliveryTaskStatus,
  GenericTaskResponse,
  GenericTaskStatus,
  GenericTaskTemplateFrequency,
  GenericTaskTemplateResponse,
  GenericTaskType,
  TaskAutomationRunResponse,
  TaskApi,
  UserRole,
  WorklistApi,
  WorklistResponse,
} from "@/src/services/api";
import { useAuth } from "@/src/state/auth";
import { useI18n } from "@/src/state/i18n";
import { todayLocalISO } from "@/src/utils/date";
import { DateInput } from "../../../components/date-input";
import {
  flushPendingSyncOperations,
  getPendingSyncSummary,
  PendingSyncSummary,
  queueGenericTaskStatus,
  shouldQueueForOffline,
} from "@/src/utils/offline-sync";
import { resolveRolePermissions } from "@/src/state/permissions";

type TaskTimeGroup = "OVERDUE" | "MORNING" | "AFTERNOON" | "EVENING" | "ANYTIME";

const GROUP_ORDER: TaskTimeGroup[] = ["OVERDUE", "MORNING", "AFTERNOON", "EVENING", "ANYTIME"];
const TEMPLATE_WEEK_DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

function parseOptionalNonNegativeInt(value: string): number | null | "INVALID" {
  const clean = value.trim();
  if (!clean) return null;
  const parsed = Number(clean);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return "INVALID";
  }
  return parsed;
}

function parseDueMinutes(dueTime?: string | null): number | null {
  if (!dueTime) return null;
  const clean = dueTime.trim();
  const parts = clean.split(":");
  if (parts.length < 2) return null;
  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function priorityRank(priority: GenericTaskResponse["priority"]) {
  if (priority === "HIGH") return 0;
  if (priority === "MEDIUM") return 1;
  return 2;
}

function statusOptions(task: GenericTaskResponse): GenericTaskStatus[] {
  if (task.taskType === "DELIVERY") {
    return ["PENDING", "DONE", "SKIPPED"];
  }
  return ["PENDING", "IN_PROGRESS", "DONE", "SKIPPED"];
}

export default function TodayTasksScreen() {
  const { x } = useI18n();
  const { user } = useAuth();
  const permissions = resolveRolePermissions(user?.role);
  const canManageTasks = permissions.canManageTasks;
  const canManageAllGenericTasks = permissions.canManageAllGenericTasks;
  const canManageTaskAutomation = permissions.canManageTaskAutomation;
  const canViewDeliveryTasks = permissions.canViewDeliveryTasks;
  const canManageDeliveryTaskAssignments = permissions.canManageDeliveryTaskAssignments;

  const [date, setDate] = useState(todayLocalISO());
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [tasks, setTasks] = useState<GenericTaskResponse[]>([]);
  const [worklist, setWorklist] = useState<WorklistResponse | null>(null);
  const [deliveryTasks, setDeliveryTasks] = useState<DeliveryTaskResponse[]>([]);
  const [deliverySavingTaskId, setDeliverySavingTaskId] = useState<string | null>(null);
  const [taskTemplates, setTaskTemplates] = useState<GenericTaskTemplateResponse[]>([]);
  const [automationResult, setAutomationResult] = useState<TaskAutomationRunResponse | null>(null);
  const [runningAutomation, setRunningAutomation] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateTitle, setTemplateTitle] = useState("");
  const [templateDueTime, setTemplateDueTime] = useState("06:30");
  const [templateTaskType, setTemplateTaskType] = useState<GenericTaskType>("FARM");
  const [templateAssignedRole, setTemplateAssignedRole] = useState<UserRole>("WORKER");
  const [templateFrequency, setTemplateFrequency] = useState<GenericTaskTemplateFrequency>("DAILY");
  const [templateDaysOfWeek, setTemplateDaysOfWeek] = useState<string[]>([]);
  const [templateDetails, setTemplateDetails] = useState("");
  const [templateReminderLeadMinutes, setTemplateReminderLeadMinutes] = useState("60");
  const [templateReminderRepeatMinutes, setTemplateReminderRepeatMinutes] = useState("180");
  const [templateEscalationDelayMinutes, setTemplateEscalationDelayMinutes] = useState("240");
  const [templateEscalateToRole, setTemplateEscalateToRole] = useState<UserRole>("MANAGER");
  const [updatingTemplateId, setUpdatingTemplateId] = useState<string | null>(null);
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

  const templateAssignableRoles = useMemo<UserRole[]>(() => {
    if (user?.role === "FEED_MANAGER") {
      return ["WORKER", "FEED_MANAGER"];
    }
    if (user?.role === "MANAGER") {
      return ["WORKER", "DELIVERY", "FEED_MANAGER", "VET", "MANAGER"];
    }
    return ["WORKER", "DELIVERY", "FEED_MANAGER", "VET", "MANAGER", "ADMIN"];
  }, [user?.role]);

  const templateEscalationRoles = useMemo<UserRole[]>(() => {
    if (user?.role === "FEED_MANAGER") {
      return ["MANAGER", "ADMIN"];
    }
    if (user?.role === "MANAGER") {
      return ["MANAGER", "ADMIN"];
    }
    return ["MANAGER", "ADMIN", "VET", "FEED_MANAGER"];
  }, [user?.role]);

  useEffect(() => {
    if (!templateAssignableRoles.includes(templateAssignedRole)) {
      setTemplateAssignedRole(templateAssignableRoles[0] ?? "WORKER");
    }
  }, [templateAssignableRoles, templateAssignedRole]);

  useEffect(() => {
    if (!templateEscalationRoles.includes(templateEscalateToRole)) {
      setTemplateEscalateToRole(templateEscalationRoles[0] ?? "MANAGER");
    }
  }, [templateEscalationRoles, templateEscalateToRole]);

  const statusLabel = (status: GenericTaskStatus) => {
    if (status === "PENDING") return x("Pending", "पेंडिंग");
    if (status === "IN_PROGRESS") return x("In Progress", "चालू");
    if (status === "SKIPPED") return x("Skipped", "स्किप");
    return x("Done", "पूरा");
  };

  const taskTypeLabel = (taskType: GenericTaskResponse["taskType"]) => {
    if (taskType === "DELIVERY") return x("Delivery", "डिलीवरी");
    if (taskType === "FEED") return x("Feed", "फीड");
    if (taskType === "FARM") return x("Farm", "फार्म");
    return x("Other", "अन्य");
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      if (canViewDeliveryTasks) {
        // Keep delivery checklist fresh for the selected date before loading cards.
        await DeliveryTaskApi.generateSubscriptions(date).catch(() => undefined);
      }
      const [rows, worklistRes, deliveryRows, templateRows] = await Promise.all([
        TaskApi.list({ date }),
        WorklistApi.today(date, 7),
        canViewDeliveryTasks ? DeliveryTaskApi.list({ date }) : Promise.resolve([] as DeliveryTaskResponse[]),
        canManageTaskAutomation
          ? TaskApi.listTemplates().catch(() => [] as GenericTaskTemplateResponse[])
          : Promise.resolve([] as GenericTaskTemplateResponse[]),
      ]);
      setTasks(rows);
      setWorklist(worklistRes);
      setDeliveryTasks(deliveryRows);
      setTaskTemplates(templateRows);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load today tasks.", "आज के टास्क लोड नहीं हुए।")
      );
    } finally {
      setLoading(false);
    }
  }, [canManageTaskAutomation, canViewDeliveryTasks, date, x]);

  const refreshPendingSync = useCallback(async () => {
    setPendingSync(await getPendingSyncSummary());
  }, []);

  const canViewGenericTask = useCallback(
    (task: GenericTaskResponse) => {
      if (!user) return false;
      if (canManageAllGenericTasks) return true;
      const me = user.username.trim().toLowerCase();
      const assignee = (task.assignedToUsername ?? "").trim().toLowerCase();
      if (assignee && assignee === me) return true;
      if (assignee && assignee !== me) return false;
      if (task.assignedRole === user.role) return true;
      if (user.role === "DELIVERY" && task.taskType === "DELIVERY") return true;
      if (user.role === "FEED_MANAGER" && task.taskType === "FEED") return true;
      return false;
    },
    [canManageAllGenericTasks, user]
  );

  const canActOnGenericTask = useCallback(
    (task: GenericTaskResponse) => {
      if (!user) return false;
      if (canManageAllGenericTasks) return true;
      const me = user.username.trim().toLowerCase();
      const assignee = (task.assignedToUsername ?? "").trim().toLowerCase();
      if (assignee) {
        return assignee === me;
      }
      if (task.assignedRole === user.role) return true;
      if (user.role === "DELIVERY" && task.taskType === "DELIVERY") return true;
      if (user.role === "FEED_MANAGER" && task.taskType === "FEED") return true;
      return false;
    },
    [canManageAllGenericTasks, user]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void refreshPendingSync();
  }, [refreshPendingSync]);

  const roleScopedTasks = useMemo(() => tasks.filter((task) => canViewGenericTask(task)), [canViewGenericTask, tasks]);

  const visibleTasks = useMemo(() => {
    if (showCompleted) {
      return roleScopedTasks;
    }
    return roleScopedTasks.filter((task) => task.status !== "DONE" && task.status !== "SKIPPED");
  }, [roleScopedTasks, showCompleted]);

  const summary = useMemo(() => {
    const pending = visibleTasks.filter((task) => task.status === "PENDING").length;
    const inProgress = visibleTasks.filter((task) => task.status === "IN_PROGRESS").length;
    const done = roleScopedTasks.filter((task) => task.status === "DONE").length;
    const today = todayLocalISO();
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const overdue = visibleTasks.filter((task) => {
      if (date !== today) return false;
      const due = parseDueMinutes(task.dueTime);
      return due != null && due < nowMins && task.status !== "DONE" && task.status !== "SKIPPED";
    }).length;
    return { total: visibleTasks.length, pending, inProgress, done, overdue };
  }, [date, roleScopedTasks, visibleTasks]);

  const groupedTasks = useMemo(() => {
    const today = todayLocalISO();
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();

    const map: Record<TaskTimeGroup, GenericTaskResponse[]> = {
      OVERDUE: [],
      MORNING: [],
      AFTERNOON: [],
      EVENING: [],
      ANYTIME: [],
    };

    for (const task of visibleTasks) {
      const due = parseDueMinutes(task.dueTime);
      let group: TaskTimeGroup = "ANYTIME";
      if (due == null) {
        group = "ANYTIME";
      } else if (
        date === today &&
        due < nowMins &&
        task.status !== "DONE" &&
        task.status !== "SKIPPED"
      ) {
        group = "OVERDUE";
      } else if (due < 12 * 60) {
        group = "MORNING";
      } else if (due < 17 * 60) {
        group = "AFTERNOON";
      } else {
        group = "EVENING";
      }
      map[group].push(task);
    }

    for (const group of GROUP_ORDER) {
      map[group].sort((a, b) => {
        const aDue = parseDueMinutes(a.dueTime);
        const bDue = parseDueMinutes(b.dueTime);
        if (aDue == null && bDue != null) return 1;
        if (aDue != null && bDue == null) return -1;
        if (aDue != null && bDue != null && aDue !== bDue) return aDue - bDue;
        const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
        if (byPriority !== 0) return byPriority;
        return a.title.localeCompare(b.title);
      });
    }

    return map;
  }, [date, visibleTasks]);

  const groupLabel = (group: TaskTimeGroup) => {
    if (group === "OVERDUE") return x("Overdue", "समय से बाकी");
    if (group === "MORNING") return x("Morning", "सुबह");
    if (group === "AFTERNOON") return x("Afternoon", "दोपहर");
    if (group === "EVENING") return x("Evening", "शाम");
    return x("Anytime", "कभी भी");
  };

  const updateStatus = async (taskId: string, status: GenericTaskStatus) => {
    const current = tasks.find((row) => row.taskId === taskId) ?? null;
    if (current && !canActOnGenericTask(current)) {
      Alert.alert(
        x("Not allowed", "अनुमति नहीं"),
        x("You can update only your assigned tasks.", "आप केवल अपने असाइन किए गए टास्क अपडेट कर सकते हैं।")
      );
      return;
    }
    try {
      setSavingTaskId(taskId);
      await TaskApi.updateStatus(taskId, { status });
      await load();
    } catch (e: any) {
      console.error(e);
      if (shouldQueueForOffline(e)) {
        await queueGenericTaskStatus(taskId, { status }, String(e?.message ?? ""));
        await refreshPendingSync();
        Alert.alert(
          x("Saved Offline", "ऑफलाइन सेव"),
          x("Task update is queued and will sync when network returns.", "टास्क अपडेट कतार में है और नेटवर्क आने पर सिंक होगा।")
        );
        return;
      }
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not update task status.", "टास्क स्टेटस अपडेट नहीं हुआ।")
      );
    } finally {
      setSavingTaskId(null);
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

  const visibleDeliveryTasks = useMemo(() => {
    if (!canViewDeliveryTasks) {
      return [] as DeliveryTaskResponse[];
    }
    if (canManageDeliveryTaskAssignments) {
      return deliveryTasks;
    }
    const me = (user?.username ?? "").toLowerCase();
    return deliveryTasks.filter((task) => {
      const assignee = (task.assignedToUsername ?? "").trim().toLowerCase();
      return assignee === me || assignee.length === 0;
    });
  }, [canManageDeliveryTaskAssignments, canViewDeliveryTasks, deliveryTasks, user?.username]);

  const deliverySummary = useMemo(() => {
    const total = visibleDeliveryTasks.length;
    const delivered = visibleDeliveryTasks.filter((task) => task.status === "DELIVERED").length;
    const pending = visibleDeliveryTasks.filter((task) => task.status === "PENDING").length;
    const skipped = visibleDeliveryTasks.filter((task) => task.status === "SKIPPED").length;
    return { total, delivered, pending, skipped };
  }, [visibleDeliveryTasks]);

  const updateDeliveryStatus = async (task: DeliveryTaskResponse, status: DeliveryTaskStatus) => {
    try {
      setDeliverySavingTaskId(task.deliveryTaskId);
      const currentAssignee = (task.assignedToUsername ?? "").trim();
      if (!currentAssignee && user?.username) {
        await DeliveryTaskApi.assign(task.deliveryTaskId, {
          assignedToUsername: user.username,
          notes: "Claimed from unified daily task board.",
        });
      }
      await DeliveryTaskApi.updateStatus(task.deliveryTaskId, {
        status,
        deliveredQtyLiters:
          status === "DELIVERED"
            ? task.deliveredQtyLiters ?? task.plannedQtyLiters
            : task.deliveredQtyLiters ?? null,
      });
      await load();
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not update delivery status.", "डिलीवरी स्टेटस अपडेट नहीं हुआ।")
      );
    } finally {
      setDeliverySavingTaskId(null);
    }
  };

  const runAutomationNow = async (dryRun = false) => {
    if (!canManageTaskAutomation) return;
    try {
      setRunningAutomation(true);
      const result = await TaskApi.runAutomation(date, dryRun);
      setAutomationResult(result);
      if (!dryRun) {
        await load();
      }
      Alert.alert(
        x("Automation complete", "ऑटोमेशन पूरा"),
        x(
          `Templates ${result.processedTemplates} | Generated ${result.generatedTasks} | Escalated ${result.escalatedTasks} | Reminders ${result.remindersTriggered}`,
          `टेम्पलेट ${result.processedTemplates} | नए ${result.generatedTasks} | एस्केलेट ${result.escalatedTasks} | रिमाइंडर ${result.remindersTriggered}`
        )
      );
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Automation failed", "ऑटोमेशन असफल"),
        e?.message ?? x("Could not run task automation.", "टास्क ऑटोमेशन नहीं चला।")
      );
    } finally {
      setRunningAutomation(false);
    }
  };

  const toggleTemplateDay = (day: string) => {
    setTemplateDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((row) => row !== day) : [...prev, day]
    );
  };

  const updateTemplateActive = async (template: GenericTaskTemplateResponse, nextActive: boolean) => {
    try {
      setUpdatingTemplateId(template.taskTemplateId);
      const payload: CreateGenericTaskTemplatePayload = {
        title: template.title,
        details: template.details ?? null,
        taskType: template.taskType,
        assignedRole: template.assignedRole,
        assignedToUsername: template.assignedToUsername ?? null,
        priority: template.priority,
        dueTime: template.dueTime ?? null,
        frequency: template.frequency,
        daysOfWeek: template.daysOfWeek ?? [],
        startDate: template.startDate,
        endDate: template.endDate ?? null,
        active: nextActive,
        reminderLeadMinutes: template.reminderLeadMinutes ?? null,
        reminderRepeatMinutes: template.reminderRepeatMinutes ?? null,
        escalationDelayMinutes: template.escalationDelayMinutes ?? null,
        escalateToRole: template.escalateToRole ?? null,
      };
      await TaskApi.updateTemplate(template.taskTemplateId, payload);
      await load();
      Alert.alert(
        x("Template updated", "टेम्पलेट अपडेट हुआ"),
        nextActive
          ? x("Template is active now.", "टेम्पलेट अब सक्रिय है।")
          : x("Template is paused now.", "टेम्पलेट अब रुका हुआ है।")
      );
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Update failed", "अपडेट नहीं हुआ"),
        e?.message ?? x("Could not update template.", "टेम्पलेट अपडेट नहीं हुआ।")
      );
    } finally {
      setUpdatingTemplateId(null);
    }
  };

  const saveTaskTemplate = async () => {
    const title = templateTitle.trim();
    if (!title) {
      Alert.alert(
        x("Template title required", "टेम्पलेट शीर्षक जरूरी"),
        x("Enter template title before saving.", "सेव करने से पहले टेम्पलेट शीर्षक दर्ज करें।")
      );
      return;
    }
    const dueTime = templateDueTime.trim();
    if (dueTime && !/^\d{2}:\d{2}$/.test(dueTime)) {
      Alert.alert(
        x("Invalid due time", "गलत समय"),
        x("Use HH:mm format, for example 06:30.", "HH:mm फॉर्मेट रखें, जैसे 06:30।")
      );
      return;
    }
    const reminderLeadMinutes = parseOptionalNonNegativeInt(templateReminderLeadMinutes);
    if (reminderLeadMinutes === "INVALID") {
      Alert.alert(
        x("Invalid reminder lead", "गलत रिमाइंडर लीड"),
        x("Reminder lead must be a non-negative whole number.", "रिमाइंडर लीड 0 या उससे बड़ा पूर्णांक होना चाहिए।")
      );
      return;
    }
    const reminderRepeatMinutes = parseOptionalNonNegativeInt(templateReminderRepeatMinutes);
    if (reminderRepeatMinutes === "INVALID") {
      Alert.alert(
        x("Invalid reminder repeat", "गलत रिमाइंडर रिपीट"),
        x("Reminder repeat must be a non-negative whole number.", "रिमाइंडर रिपीट 0 या उससे बड़ा पूर्णांक होना चाहिए।")
      );
      return;
    }
    const escalationDelayMinutes = parseOptionalNonNegativeInt(templateEscalationDelayMinutes);
    if (escalationDelayMinutes === "INVALID") {
      Alert.alert(
        x("Invalid escalation delay", "गलत एस्केलेशन देरी"),
        x("Escalation delay must be a non-negative whole number.", "एस्केलेशन देरी 0 या उससे बड़ा पूर्णांक होना चाहिए।")
      );
      return;
    }

    const payload: CreateGenericTaskTemplatePayload = {
      title,
      details: templateDetails.trim() || null,
      taskType: templateTaskType,
      assignedRole: templateAssignedRole,
      priority: "MEDIUM",
      dueTime: dueTime || null,
      frequency: templateFrequency,
      daysOfWeek: templateFrequency === "WEEKLY" ? templateDaysOfWeek : [],
      startDate: date,
      active: true,
      reminderLeadMinutes,
      reminderRepeatMinutes,
      escalationDelayMinutes,
      escalateToRole: templateEscalateToRole,
    };

    try {
      setSavingTemplate(true);
      await TaskApi.createTemplate(payload);
      setTemplateTitle("");
      setTemplateDetails("");
      setTemplateDueTime("06:30");
      setTemplateTaskType("FARM");
      setTemplateFrequency("DAILY");
      setTemplateDaysOfWeek([]);
      setTemplateReminderLeadMinutes("60");
      setTemplateReminderRepeatMinutes("180");
      setTemplateEscalationDelayMinutes("240");
      setTemplateEscalateToRole("MANAGER");
      await load();
      Alert.alert(
        x("Template saved", "टेम्पलेट सेव"),
        x("Recurring task template is active.", "रिकरिंग टास्क टेम्पलेट सक्रिय हो गया।")
      );
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not save task template.", "टास्क टेम्पलेट सेव नहीं हुआ।")
      );
    } finally {
      setSavingTemplate(false);
    }
  };

  const sortedTaskTemplates = useMemo(
    () =>
      [...taskTemplates].sort((a, b) => {
        if (a.active !== b.active) {
          return a.active ? -1 : 1;
        }
        return a.title.localeCompare(b.title);
      }),
    [taskTemplates]
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: DairyColors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
            {x("Today Tasks", "आज के टास्क")}
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x(
              "One checklist for delivery, feed, farm and other work.",
              "डिलीवरी, फीड, फार्म और बाकी काम के लिए एक ही चेकलिस्ट।"
            )}
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

      <Text
        style={{
          marginTop: 10,
          color: DairyColors.textSecondary,
          fontWeight: "700",
        }}
      >
        {x(`Date: ${date}`, `तारीख: ${date}`)}
      </Text>

      <DateInput
        value={date}
        onChangeText={setDate}
        placeholder={x("Date (YYYY-MM-DD)", "तारीख (YYYY-MM-DD)")}
      />

      <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 120, borderRadius: 12, backgroundColor: DairyColors.surfaceMuted, padding: 10 }}>
          <Text style={{ color: DairyColors.textSecondary }}>{x("Open Tasks", "खुले टास्क")}</Text>
          <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>{summary.total}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 120, borderRadius: 12, backgroundColor: DairyColors.warningSoft, padding: 10 }}>
          <Text style={{ color: DairyColors.textSecondary }}>{x("Pending", "पेंडिंग")}</Text>
          <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>{summary.pending}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 120, borderRadius: 12, backgroundColor: DairyColors.infoSoft, padding: 10 }}>
          <Text style={{ color: DairyColors.textSecondary }}>{x("In Progress", "चालू")}</Text>
          <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>{summary.inProgress}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 120, borderRadius: 12, backgroundColor: DairyColors.dangerSoft, padding: 10 }}>
          <Text style={{ color: DairyColors.textSecondary }}>{x("Overdue", "समय से बाकी")}</Text>
          <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>{summary.overdue}</Text>
        </View>
      </View>

      <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 120, borderRadius: 12, backgroundColor: DairyColors.warningSoft, padding: 10 }}>
          <Text style={{ color: DairyColors.textSecondary }}>{x("Worklist Overdue", "वर्कलिस्ट ओवरड्यू")}</Text>
          <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>
            {worklist?.overdueCount ?? 0}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 120, borderRadius: 12, backgroundColor: DairyColors.infoSoft, padding: 10 }}>
          <Text style={{ color: DairyColors.textSecondary }}>{x("Due Soon", "जल्द देय")}</Text>
          <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>
            {worklist?.dueSoonCount ?? 0}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 120, borderRadius: 12, backgroundColor: DairyColors.accentSoft, padding: 10 }}>
          <Text style={{ color: DairyColors.textSecondary }}>{x("High Priority", "उच्च प्राथमिकता")}</Text>
          <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>
            {worklist?.highPriorityCount ?? 0}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
        <Pressable
          onPress={() => setShowCompleted((v) => !v)}
          style={{
            borderWidth: 1,
            borderColor: showCompleted ? DairyColors.primary : DairyColors.border,
            backgroundColor: showCompleted ? DairyColors.primarySoft : DairyColors.surface,
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
            {showCompleted
              ? x("Hide Completed", "पूरा हुए छिपाएं")
              : x("Show Completed", "पूरा हुए दिखाएं")}
          </Text>
        </Pressable>
        {canManageTasks ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: DairyColors.border,
              backgroundColor: DairyColors.surfaceMuted,
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 8,
              justifyContent: "center",
            }}
          >
            <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
              {x("Manager view enabled", "मैनेजर व्यू चालू")}
            </Text>
          </View>
        ) : null}
      </View>

      {canManageTaskAutomation ? (
        <View
          style={{
            marginTop: 12,
            borderWidth: 1,
            borderColor: DairyColors.border,
            borderRadius: 14,
            backgroundColor: DairyColors.surface,
            padding: 12,
          }}
        >
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
            {x("Task Automation", "टास्क ऑटोमेशन")}
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x(
              "Recurring templates, escalation for overdue tasks, and reminders.",
              "रिकरिंग टेम्पलेट, ओवरड्यू टास्क एस्केलेशन और रिमाइंडर।"
            )}
          </Text>

          <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Pressable
              onPress={() => void runAutomationNow(false)}
              disabled={runningAutomation}
              style={{
                borderRadius: 999,
                backgroundColor: runningAutomation ? DairyColors.textSecondary : DairyColors.primary,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: "white", fontWeight: "800" }}>
                {runningAutomation ? x("Running...", "चल रहा है...") : x("Run Automation", "ऑटोमेशन चलाएं")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void runAutomationNow(true)}
              disabled={runningAutomation}
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: DairyColors.border,
                backgroundColor: DairyColors.surfaceMuted,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                {x("Dry Run", "ड्राई रन")}
              </Text>
            </Pressable>
          </View>

          {automationResult ? (
            <View
              style={{
                marginTop: 10,
                borderRadius: 10,
                backgroundColor: DairyColors.infoSoft,
                borderWidth: 1,
                borderColor: DairyColors.border,
                padding: 10,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                {x(
                  `Templates ${automationResult.processedTemplates} | Generated ${automationResult.generatedTasks} | Escalated ${automationResult.escalatedTasks} | Reminders ${automationResult.remindersTriggered}`,
                  `टेम्पलेट ${automationResult.processedTemplates} | नए ${automationResult.generatedTasks} | एस्केलेट ${automationResult.escalatedTasks} | रिमाइंडर ${automationResult.remindersTriggered}`
                )}
              </Text>
              {automationResult.reminders.length > 0 ? (
                <View style={{ marginTop: 8 }}>
                  {automationResult.reminders.slice(0, 5).map((reminder) => (
                    <Text
                      key={`${reminder.taskId}-${reminder.reminderAt}`}
                      style={{ marginTop: 3, color: DairyColors.textSecondary }}
                    >
                      {x(
                        `${reminder.reminderAt} | ${reminder.title} | ${reminder.assignedRole}${reminder.assignedToUsername ? ` (${reminder.assignedToUsername})` : ""}`,
                        `${reminder.reminderAt} | ${reminder.title} | ${reminder.assignedRole}${reminder.assignedToUsername ? ` (${reminder.assignedToUsername})` : ""}`
                      )}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          <View
            style={{
              marginTop: 12,
              borderWidth: 1,
              borderColor: DairyColors.border,
              borderRadius: 10,
              backgroundColor: DairyColors.surfaceMuted,
              padding: 10,
            }}
          >
            <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
              {x("Create Recurring Template", "रिकरिंग टेम्पलेट बनाएं")}
            </Text>

            <TextInput
              value={templateTitle}
              onChangeText={setTemplateTitle}
              placeholder={x("Template title", "टेम्पलेट शीर्षक")}
              placeholderTextColor={DairyColors.textSecondary}
              style={{
                marginTop: 8,
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 10,
                backgroundColor: DairyColors.surface,
                color: DairyColors.textPrimary,
                paddingHorizontal: 10,
                paddingVertical: 9,
              }}
            />

            <TextInput
              value={templateDetails}
              onChangeText={setTemplateDetails}
              placeholder={x("Template details (optional)", "टेम्पलेट विवरण (वैकल्पिक)")}
              placeholderTextColor={DairyColors.textSecondary}
              multiline
              style={{
                marginTop: 8,
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 10,
                backgroundColor: DairyColors.surface,
                color: DairyColors.textPrimary,
                paddingHorizontal: 10,
                paddingVertical: 9,
                minHeight: 70,
                textAlignVertical: "top",
              }}
            />

            <TextInput
              value={templateDueTime}
              onChangeText={setTemplateDueTime}
              placeholder={x("Due time (HH:mm)", "समय (HH:mm)")}
              placeholderTextColor={DairyColors.textSecondary}
              style={{
                marginTop: 8,
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 10,
                backgroundColor: DairyColors.surface,
                color: DairyColors.textPrimary,
                paddingHorizontal: 10,
                paddingVertical: 9,
              }}
            />

            <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(["FEED", "DELIVERY", "FARM", "OTHER"] as GenericTaskType[]).map((taskType) => (
                <Pressable
                  key={`tpl-task-type-${taskType}`}
                  onPress={() => setTemplateTaskType(taskType)}
                  style={{
                    borderWidth: 1,
                    borderColor: templateTaskType === taskType ? DairyColors.primary : DairyColors.border,
                    backgroundColor: templateTaskType === taskType ? DairyColors.primarySoft : DairyColors.surface,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                  }}
                >
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{taskType}</Text>
                </Pressable>
              ))}
            </View>

            <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {templateAssignableRoles.map((role) => (
                <Pressable
                  key={`tpl-role-${role}`}
                  onPress={() => setTemplateAssignedRole(role)}
                  style={{
                    borderWidth: 1,
                    borderColor: templateAssignedRole === role ? DairyColors.primary : DairyColors.border,
                    backgroundColor: templateAssignedRole === role ? DairyColors.primarySoft : DairyColors.surface,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                  }}
                >
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{role}</Text>
                </Pressable>
              ))}
            </View>

            <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(["DAILY", "WEEKLY"] as GenericTaskTemplateFrequency[]).map((freq) => (
                <Pressable
                  key={`tpl-freq-${freq}`}
                  onPress={() => setTemplateFrequency(freq)}
                  style={{
                    borderWidth: 1,
                    borderColor: templateFrequency === freq ? DairyColors.primary : DairyColors.border,
                    backgroundColor: templateFrequency === freq ? DairyColors.primarySoft : DairyColors.surface,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                  }}
                >
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{freq}</Text>
                </Pressable>
              ))}
            </View>

            {templateFrequency === "WEEKLY" ? (
              <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {TEMPLATE_WEEK_DAYS.map((day) => (
                  <Pressable
                    key={`tpl-day-${day}`}
                    onPress={() => toggleTemplateDay(day)}
                    style={{
                      borderWidth: 1,
                      borderColor: templateDaysOfWeek.includes(day) ? DairyColors.primary : DairyColors.border,
                      backgroundColor: templateDaysOfWeek.includes(day)
                        ? DairyColors.primarySoft
                        : DairyColors.surface,
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                    }}
                  >
                    <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{day.slice(0, 3)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <View style={{ flex: 1, minWidth: 130 }}>
                <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Reminder lead (min)", "रिमाइंडर लीड (मिनट)")}
                </Text>
                <TextInput
                  value={templateReminderLeadMinutes}
                  onChangeText={setTemplateReminderLeadMinutes}
                  keyboardType="numeric"
                  placeholder="60"
                  placeholderTextColor={DairyColors.textSecondary}
                  style={{
                    marginTop: 6,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    backgroundColor: DairyColors.surface,
                    color: DairyColors.textPrimary,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                  }}
                />
              </View>
              <View style={{ flex: 1, minWidth: 130 }}>
                <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Reminder repeat (min)", "रिमाइंडर रिपीट (मिनट)")}
                </Text>
                <TextInput
                  value={templateReminderRepeatMinutes}
                  onChangeText={setTemplateReminderRepeatMinutes}
                  keyboardType="numeric"
                  placeholder="180"
                  placeholderTextColor={DairyColors.textSecondary}
                  style={{
                    marginTop: 6,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    backgroundColor: DairyColors.surface,
                    color: DairyColors.textPrimary,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                  }}
                />
              </View>
            </View>

            <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <View style={{ flex: 1, minWidth: 130 }}>
                <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Escalation delay (min)", "एस्केलेशन देरी (मिनट)")}
                </Text>
                <TextInput
                  value={templateEscalationDelayMinutes}
                  onChangeText={setTemplateEscalationDelayMinutes}
                  keyboardType="numeric"
                  placeholder="240"
                  placeholderTextColor={DairyColors.textSecondary}
                  style={{
                    marginTop: 6,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    backgroundColor: DairyColors.surface,
                    color: DairyColors.textPrimary,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                  }}
                />
              </View>
              <View style={{ flex: 1, minWidth: 130 }}>
                <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Escalate to role", "एस्केलेट रोल")}
                </Text>
                <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {templateEscalationRoles.map((role) => (
                    <Pressable
                      key={`tpl-escalate-role-${role}`}
                      onPress={() => setTemplateEscalateToRole(role)}
                      style={{
                        borderWidth: 1,
                        borderColor: templateEscalateToRole === role ? DairyColors.primary : DairyColors.border,
                        backgroundColor:
                          templateEscalateToRole === role ? DairyColors.primarySoft : DairyColors.surface,
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                      }}
                    >
                      <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{role}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <Pressable
              onPress={() => void saveTaskTemplate()}
              disabled={savingTemplate}
              style={{
                marginTop: 10,
                borderRadius: 10,
                backgroundColor: savingTemplate ? DairyColors.textSecondary : DairyColors.primary,
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 10,
              }}
            >
              <Text style={{ color: "white", fontWeight: "800" }}>
                {savingTemplate ? x("Saving...", "सेव हो रहा है...") : x("Save Template", "टेम्पलेट सेव करें")}
              </Text>
            </Pressable>
          </View>

          {taskTemplates.length > 0 ? (
            <View style={{ marginTop: 10 }}>
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                {x("Templates", "टेम्पलेट")}
              </Text>
              {sortedTaskTemplates.slice(0, 15).map((template) => (
                <View
                  key={`template-row-${template.taskTemplateId}`}
                  style={{
                    marginTop: 8,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    backgroundColor: DairyColors.surfaceMuted,
                    padding: 10,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", flexShrink: 1 }}>{template.title}</Text>
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: template.active ? DairyColors.success : DairyColors.textSecondary,
                        backgroundColor: template.active ? DairyColors.successSoft : DairyColors.surface,
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                      }}
                    >
                      <Text style={{ color: DairyColors.textPrimary, fontWeight: "700", fontSize: 12 }}>
                        {template.active ? x("Active", "सक्रिय") : x("Paused", "रुका")}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                    {x(
                      `${template.taskType} | ${template.frequency} | Due ${template.dueTime ?? "Anytime"}`,
                      `${template.taskType} | ${template.frequency} | समय ${template.dueTime ?? "कभी भी"}`
                    )}
                  </Text>
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                    {x(
                      `Assigned ${template.assignedRole}${template.assignedToUsername ? ` (${template.assignedToUsername})` : ""}`,
                      `असाइन ${template.assignedRole}${template.assignedToUsername ? ` (${template.assignedToUsername})` : ""}`
                    )}
                  </Text>
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                    {x(
                      `Reminder lead ${template.reminderLeadMinutes ?? "-"} | Repeat ${template.reminderRepeatMinutes ?? "-"} | Escalate ${template.escalationDelayMinutes ?? "-"} to ${template.escalateToRole ?? "-"}`,
                      `रिमाइंडर लीड ${template.reminderLeadMinutes ?? "-"} | रिपीट ${template.reminderRepeatMinutes ?? "-"} | एस्केलेट ${template.escalationDelayMinutes ?? "-"} मिनट में ${template.escalateToRole ?? "-"}`
                    )}
                  </Text>
                  {template.details ? (
                    <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>{template.details}</Text>
                  ) : null}
                  <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
                    <Pressable
                      onPress={() => void updateTemplateActive(template, !template.active)}
                      disabled={updatingTemplateId === template.taskTemplateId}
                      style={{
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: DairyColors.border,
                        backgroundColor: DairyColors.surface,
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                      }}
                    >
                      <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                        {updatingTemplateId === template.taskTemplateId
                          ? x("Saving...", "सेव...")
                          : template.active
                            ? x("Pause", "रोकें")
                            : x("Activate", "सक्रिय करें")}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {worklist && worklist.items.length > 0 ? (
        <View
          style={{
            marginTop: 12,
            borderWidth: 1,
            borderColor: DairyColors.border,
            borderRadius: 14,
            backgroundColor: DairyColors.surface,
            padding: 12,
          }}
        >
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
            {x("Auto Worklist Alerts", "ऑटो वर्कलिस्ट अलर्ट")}
          </Text>
          {worklist.items.slice(0, 8).map((row) => (
            <View
              key={`worklist-${row.taskId}`}
              style={{
                marginTop: 8,
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 10,
                backgroundColor: DairyColors.surfaceMuted,
                padding: 10,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>{row.title}</Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x(
                  `Due ${row.dueDate ?? "-"} | Priority ${row.priority} | ${row.dueStatus}`,
                  `देय ${row.dueDate ?? "-"} | प्राथमिकता ${row.priority} | ${row.dueStatus}`
                )}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View
        style={{
          marginTop: 10,
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
            `Total ${pendingSync.total} | Task updates ${pendingSync.genericTaskStatus} | Dead letter ${pendingSync.deadLetter}`,
            `कुल ${pendingSync.total} | टास्क अपडेट ${pendingSync.genericTaskStatus} | डेड लेटर ${pendingSync.deadLetter}`
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

      {canViewDeliveryTasks ? (
        <View
          style={{
            marginTop: 12,
            borderWidth: 1,
            borderColor: DairyColors.border,
            borderRadius: 14,
            backgroundColor: DairyColors.surface,
            padding: 12,
          }}
        >
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
            {x("Delivery Tasks", "डिलीवरी टास्क")}
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x(
              `Stops ${deliverySummary.total} | Delivered ${deliverySummary.delivered} | Pending ${deliverySummary.pending} | Skipped ${deliverySummary.skipped}`,
              `स्टॉप ${deliverySummary.total} | डिलीवर ${deliverySummary.delivered} | बाकी ${deliverySummary.pending} | स्किप ${deliverySummary.skipped}`
            )}
          </Text>
          {visibleDeliveryTasks.length === 0 ? (
            <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
              {x("No delivery tasks for selected date.", "चुनी हुई तारीख के लिए कोई डिलीवरी टास्क नहीं है।")}
            </Text>
          ) : (
            visibleDeliveryTasks.slice(0, 30).map((task) => {
              const mine = ((task.assignedToUsername ?? "").trim().toLowerCase() ===
                (user?.username ?? "").trim().toLowerCase());
              const unassigned = !(task.assignedToUsername ?? "").trim();
              const canAct = canManageDeliveryTaskAssignments || mine || unassigned;
              return (
                <View
                  key={`delivery-task-${task.deliveryTaskId}`}
                  style={{
                    marginTop: 8,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    backgroundColor: DairyColors.surfaceMuted,
                    padding: 10,
                  }}
                >
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>{task.customerName}</Text>
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                    {x(
                      `${task.taskShift ?? "AM"} | ${task.productType ?? "MILK"} | Planned ${task.plannedQtyLiters.toFixed(2)} L`,
                      `${task.taskShift ?? "AM"} | ${task.productType ?? "MILK"} | योजना ${task.plannedQtyLiters.toFixed(2)} L`
                    )}
                  </Text>
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                    {x(
                      `Assigned: ${task.assignedToUsername ?? "Unassigned"} | Status: ${task.status}`,
                      `असाइन: ${task.assignedToUsername ?? "अनअसाइन्ड"} | स्थिति: ${task.status}`
                    )}
                  </Text>
                  <View style={{ marginTop: 8, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    {(["PENDING", "DELIVERED", "SKIPPED"] as DeliveryTaskStatus[]).map((status) => (
                      <Pressable
                        key={`${task.deliveryTaskId}-${status}`}
                        disabled={!canAct || deliverySavingTaskId === task.deliveryTaskId}
                        onPress={() => void updateDeliveryStatus(task, status)}
                        style={{
                          borderWidth: 1,
                          borderColor: task.status === status ? DairyColors.primary : DairyColors.border,
                          backgroundColor: task.status === status ? DairyColors.primarySoft : DairyColors.surface,
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 7,
                          opacity: !canAct ? 0.55 : 1,
                        }}
                      >
                        <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                          {status}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })
          )}
        </View>
      ) : null}

      {GROUP_ORDER.map((group) => {
        const rows = groupedTasks[group];
        if (rows.length === 0) return null;
        return (
          <View
            key={group}
            style={{
              marginTop: 12,
              borderWidth: 1,
              borderColor: DairyColors.border,
              borderRadius: 14,
              backgroundColor: DairyColors.surface,
              padding: 12,
            }}
          >
            <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
              {groupLabel(group)}
            </Text>

            {rows.map((task) => {
              const canAct = canActOnGenericTask(task);
              return (
                <View
                  key={task.taskId}
                  style={{
                    marginTop: 10,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    backgroundColor: DairyColors.surfaceMuted,
                    padding: 10,
                  }}
                >
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>{task.title}</Text>
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                    {taskTypeLabel(task.taskType)} | {x("Due", "समय")}: {task.dueTime ?? x("Anytime", "कभी भी")}
                  </Text>
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                    {x("Priority", "प्राथमिकता")}: {task.priority} | {x("Status", "स्थिति")}: {statusLabel(task.status)}
                  </Text>
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                    {x(
                      `Assigned ${task.assignedRole}${task.assignedToUsername ? ` (${task.assignedToUsername})` : ""}`,
                      `असाइन ${task.assignedRole}${task.assignedToUsername ? ` (${task.assignedToUsername})` : ""}`
                    )}
                  </Text>
                  {task.details ? (
                    <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>{task.details}</Text>
                  ) : null}

                  <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {statusOptions(task).map((status) => (
                      <Pressable
                        key={`${task.taskId}-${status}`}
                        disabled={!canAct || savingTaskId === task.taskId}
                        onPress={() => void updateStatus(task.taskId, status)}
                        style={{
                          borderWidth: 1,
                          borderColor: task.status === status ? DairyColors.primary : DairyColors.border,
                          backgroundColor: task.status === status ? DairyColors.primarySoft : DairyColors.surface,
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 7,
                          opacity: !canAct ? 0.5 : 1,
                        }}
                      >
                        <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                          {statusLabel(status)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {!canAct ? (
                    <Text style={{ marginTop: 6, color: DairyColors.textSecondary }}>
                      {x("Read only: assigned user can update this task.", "केवल असाइन्ड यूजर यह टास्क अपडेट कर सकता है।")}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        );
      })}

      {visibleTasks.length === 0 ? (
        <Text style={{ marginTop: 12, color: DairyColors.textSecondary }}>
          {loading
            ? x("Loading tasks...", "टास्क लोड हो रहे हैं...")
            : x("No tasks for selected date.", "चुनी हुई तारीख के लिए कोई टास्क नहीं है।")}
        </Text>
      ) : null}
    </ScrollView>
  );
}
