import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { DairyColors } from "../../constants/dairy-theme";
import {
  GenericTaskResponse,
  GenericTaskStatus,
  TaskApi,
} from "../../services/api";
import { useAuth } from "../../state/auth";
import { useI18n } from "../../state/i18n";
import { todayLocalISO } from "../../utils/date";
import {
  flushPendingSyncOperations,
  getPendingSyncSummary,
  PendingSyncSummary,
  queueGenericTaskStatus,
  shouldQueueForOffline,
} from "../../utils/offline-sync";

type TaskTimeGroup = "OVERDUE" | "MORNING" | "AFTERNOON" | "EVENING" | "ANYTIME";

const GROUP_ORDER: TaskTimeGroup[] = ["OVERDUE", "MORNING", "AFTERNOON", "EVENING", "ANYTIME"];

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
  const router = useRouter();
  const { x } = useI18n();
  const { hasAnyRole } = useAuth();
  const canOpenTaskManager = hasAnyRole("ADMIN", "MANAGER", "FEED_MANAGER");

  const [date] = useState(todayLocalISO());
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [tasks, setTasks] = useState<GenericTaskResponse[]>([]);
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
      const rows = await TaskApi.list({ date });
      setTasks(rows);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load today tasks.", "आज के टास्क लोड नहीं हुए।")
      );
    } finally {
      setLoading(false);
    }
  }, [date, x]);

  const refreshPendingSync = useCallback(async () => {
    setPendingSync(await getPendingSyncSummary());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void refreshPendingSync();
  }, [refreshPendingSync]);

  const visibleTasks = useMemo(() => {
    if (showCompleted) {
      return tasks;
    }
    return tasks.filter((task) => task.status !== "DONE" && task.status !== "SKIPPED");
  }, [showCompleted, tasks]);

  const summary = useMemo(() => {
    const pending = visibleTasks.filter((task) => task.status === "PENDING").length;
    const inProgress = visibleTasks.filter((task) => task.status === "IN_PROGRESS").length;
    const done = tasks.filter((task) => task.status === "DONE").length;
    const today = todayLocalISO();
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const overdue = visibleTasks.filter((task) => {
      if (date !== today) return false;
      const due = parseDueMinutes(task.dueTime);
      return due != null && due < nowMins && task.status !== "DONE" && task.status !== "SKIPPED";
    }).length;
    return { total: visibleTasks.length, pending, inProgress, done, overdue };
  }, [date, tasks, visibleTasks]);

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

        {canOpenTaskManager ? (
          <Pressable
            onPress={() => router.push("/tasks")}
            style={{
              borderWidth: 1,
              borderColor: DairyColors.border,
              backgroundColor: DairyColors.surface,
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
              {x("Open Task Manager", "टास्क मैनेजर खोलें")}
            </Text>
          </Pressable>
        ) : null}
      </View>

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

            {rows.map((task) => (
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
                {task.details ? (
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>{task.details}</Text>
                ) : null}

                <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {statusOptions(task).map((status) => (
                    <Pressable
                      key={`${task.taskId}-${status}`}
                      disabled={savingTaskId === task.taskId}
                      onPress={() => void updateStatus(task.taskId, status)}
                      style={{
                        borderWidth: 1,
                        borderColor: task.status === status ? DairyColors.primary : DairyColors.border,
                        backgroundColor: task.status === status ? DairyColors.primarySoft : DairyColors.surface,
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                      }}
                    >
                      <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                        {statusLabel(status)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
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
