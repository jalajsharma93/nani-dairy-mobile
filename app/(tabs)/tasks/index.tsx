import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Text, TextInput, View } from "react-native";
import {
  AuthApi,
  AuthUserResponse,
  GenericTaskPriority,
  GenericTaskResponse,
  GenericTaskStatus,
  GenericTaskType,
  TaskApi,
  UserRole,
} from "../../services/api";
import { DairyColors } from "../../constants/dairy-theme";
import { useAuth } from "../../state/auth";
import { useI18n } from "../../state/i18n";
import { todayLocalISO } from "../../utils/date";

const TASK_TYPES: GenericTaskType[] = ["FARM", "DELIVERY", "FEED", "OTHER"];
const TASK_PRIORITIES: GenericTaskPriority[] = ["HIGH", "MEDIUM", "LOW"];
const TASK_STATUSES: GenericTaskStatus[] = ["PENDING", "IN_PROGRESS", "DONE", "SKIPPED"];
const TASK_ASSIGNEE_ROLES: UserRole[] = ["WORKER", "DELIVERY", "FEED_MANAGER", "VET", "MANAGER"];
const MANAGER_TEAM_ROLES: UserRole[] = ["WORKER", "DELIVERY", "FEED_MANAGER", "VET"];

export default function TasksScreen() {
  const { user, hasAnyRole } = useAuth();
  const { x } = useI18n();
  const canManageAll = hasAnyRole("ADMIN", "MANAGER", "FEED_MANAGER");

  const [date, setDate] = useState(todayLocalISO());
  const [tasks, setTasks] = useState<GenericTaskResponse[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<AuthUserResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [filterTaskType, setFilterTaskType] = useState<GenericTaskType | "ALL">("ALL");
  const [mineOnly, setMineOnly] = useState(false);
  const [managerShowMine, setManagerShowMine] = useState(true);
  const [managerShowTeam, setManagerShowTeam] = useState(true);

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDetails, setTaskDetails] = useState("");
  const [taskType, setTaskType] = useState<GenericTaskType>("FARM");
  const [taskPriority, setTaskPriority] = useState<GenericTaskPriority>("MEDIUM");
  const [taskAssignedRole, setTaskAssignedRole] = useState<UserRole>(() =>
    user?.role && TASK_ASSIGNEE_ROLES.includes(user.role) ? user.role : "WORKER"
  );
  const [taskAssignedToUsername, setTaskAssignedToUsername] = useState("");
  const [taskDueTime, setTaskDueTime] = useState("");

  const taskTypeLabel = useCallback(
    (type: GenericTaskType) => {
      if (type === "FARM") return x("Farm", "फार्म");
      if (type === "DELIVERY") return x("Delivery", "डिलीवरी");
      if (type === "FEED") return x("Feed", "फीड");
      return x("Other", "अन्य");
    },
    [x]
  );

  const taskPriorityLabel = useCallback(
    (priority: GenericTaskPriority) => {
      if (priority === "HIGH") return x("High", "उच्च");
      if (priority === "LOW") return x("Low", "कम");
      return x("Medium", "मध्यम");
    },
    [x]
  );

  const taskStatusLabel = useCallback(
    (status: GenericTaskStatus) => {
      if (status === "PENDING") return x("Pending", "पेंडिंग");
      if (status === "IN_PROGRESS") return x("In Progress", "चालू");
      if (status === "SKIPPED") return x("Skipped", "स्किप");
      return x("Done", "पूरा");
    },
    [x]
  );

  const roleLabel = useCallback(
    (role: UserRole) => {
      if (role === "MANAGER") return x("Manager", "मैनेजर");
      if (role === "WORKER") return x("Worker", "वर्कर");
      if (role === "FEED_MANAGER") return x("Feed Manager", "फीड मैनेजर");
      if (role === "DELIVERY") return x("Delivery", "डिलीवरी");
      if (role === "VET") return x("Vet", "पशु चिकित्सक");
      return x("Admin", "एडमिन");
    },
    [x]
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [taskRows, users] = await Promise.all([
        TaskApi.list({
          date,
          taskType: filterTaskType === "ALL" ? undefined : filterTaskType,
        }),
        canManageAll ? AuthApi.listAssignableUsers(TASK_ASSIGNEE_ROLES) : Promise.resolve([] as AuthUserResponse[]),
      ]);
      setTasks(taskRows);
      setAssignableUsers(users);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load tasks.", "टास्क लोड नहीं हो पाए।")
      );
    } finally {
      setLoading(false);
    }
  }, [canManageAll, date, filterTaskType, x]);

  useEffect(() => {
    void load();
  }, [load]);

  const usersForSelectedRole = useMemo(
    () =>
      assignableUsers
        .filter((row) => row.active && row.role === taskAssignedRole)
        .sort((a, b) => a.username.localeCompare(b.username)),
    [assignableUsers, taskAssignedRole]
  );

  useEffect(() => {
    if (!taskAssignedToUsername) {
      return;
    }
    if (!usersForSelectedRole.some((row) => row.username === taskAssignedToUsername)) {
      setTaskAssignedToUsername("");
    }
  }, [taskAssignedToUsername, usersForSelectedRole]);

  const visibleTasks = useMemo(() => {
    const me = (user?.username ?? "").toLowerCase();
    if (user?.role === "MANAGER") {
      return tasks.filter((task) => {
        const assignee = (task.assignedToUsername ?? "").toLowerCase();
        const mine = assignee === me || (task.assignedRole === "MANAGER" && !task.assignedToUsername);
        const team = MANAGER_TEAM_ROLES.includes(task.assignedRole);
        return (managerShowMine && mine) || (managerShowTeam && team);
      });
    }
    if (!mineOnly) {
      return tasks;
    }
    return tasks.filter((task) => (task.assignedToUsername ?? "").toLowerCase() === me);
  }, [managerShowMine, managerShowTeam, mineOnly, tasks, user?.role, user?.username]);

  const toggleManagerMine = () => {
    if (managerShowMine && !managerShowTeam) {
      return;
    }
    setManagerShowMine((v) => !v);
  };

  const toggleManagerTeam = () => {
    if (managerShowTeam && !managerShowMine) {
      return;
    }
    setManagerShowTeam((v) => !v);
  };

  const createTask = async () => {
    if (!taskTitle.trim()) {
      Alert.alert(x("Missing details", "जानकारी अधूरी"), x("Task title is required.", "टास्क का नाम जरूरी है।"));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert(x("Invalid date", "गलत तारीख"), x("Use date format YYYY-MM-DD.", "तारीख फॉर्मेट YYYY-MM-DD रखें।"));
      return;
    }
    if (taskDueTime.trim() && !/^\d{2}:\d{2}$/.test(taskDueTime.trim())) {
      Alert.alert(x("Invalid time", "गलत समय"), x("Use time format HH:MM.", "समय फॉर्मेट HH:MM रखें।"));
      return;
    }
    try {
      setSaving(true);
      const assignedRole = canManageAll ? taskAssignedRole : user?.role ?? "WORKER";
      const assignedToUsername = canManageAll
        ? taskAssignedToUsername || null
        : user?.username ?? null;
      await TaskApi.create({
        taskDate: date,
        taskType,
        title: taskTitle.trim(),
        details: taskDetails.trim() || null,
        assignedRole,
        assignedToUsername,
        priority: taskPriority,
        dueTime: taskDueTime.trim() || null,
      });
      setTaskTitle("");
      setTaskDetails("");
      setTaskDueTime("");
      setTaskAssignedToUsername("");
      await load();
      Alert.alert(x("Saved", "सेव हो गया"), x("Task added.", "टास्क जुड़ गया।"));
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not add task.", "टास्क नहीं जुड़ा।")
      );
    } finally {
      setSaving(false);
    }
  };

  const updateTaskStatus = async (taskId: string, status: GenericTaskStatus) => {
    try {
      await TaskApi.updateStatus(taskId, { status });
      await load();
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not update task.", "टास्क अपडेट नहीं हुआ।")
      );
    }
  };

  const statusOptionsForTask = (task: GenericTaskResponse): GenericTaskStatus[] => {
    if (task.taskType === "DELIVERY") {
      return ["PENDING", "DONE", "SKIPPED"];
    }
    return TASK_STATUSES;
  };

  return (
    <View style={{ flex: 1, backgroundColor: DairyColors.background }}>
      <FlatList
        data={visibleTasks}
        keyExtractor={(row) => row.taskId}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListHeaderComponent={
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
                  {x("Task Manager", "टास्क मैनेजर")}
                </Text>
                <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                  {x("Farm, delivery, feed and other tasks", "फार्म, डिलीवरी, फीड और अन्य टास्क")}
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

            <Text style={{ marginTop: 8, color: DairyColors.textSecondary, fontWeight: "700" }}>
              {x("Task Type Filter", "टास्क टाइप फ़िल्टर")}
            </Text>
            <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Pressable
                onPress={() => setFilterTaskType("ALL")}
                style={{
                  borderWidth: 1,
                  borderColor: filterTaskType === "ALL" ? DairyColors.primary : DairyColors.border,
                  backgroundColor: filterTaskType === "ALL" ? DairyColors.primarySoft : DairyColors.surface,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{x("All", "सभी")}</Text>
              </Pressable>
              {TASK_TYPES.map((type) => (
                <Pressable
                  key={`filter-${type}`}
                  onPress={() => setFilterTaskType(type)}
                  style={{
                    borderWidth: 1,
                    borderColor: filterTaskType === type ? DairyColors.primary : DairyColors.border,
                    backgroundColor: filterTaskType === type ? DairyColors.primarySoft : DairyColors.surface,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                  }}
                >
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{taskTypeLabel(type)}</Text>
                </Pressable>
              ))}
            </View>

            {user?.role === "MANAGER" ? (
              <>
                <Text style={{ marginTop: 8, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Manager View", "मैनेजर व्यू")}
                </Text>
                <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <Pressable
                    onPress={toggleManagerMine}
                    style={{
                      borderWidth: 1,
                      borderColor: managerShowMine ? DairyColors.primary : DairyColors.border,
                      backgroundColor: managerShowMine ? DairyColors.primarySoft : DairyColors.surface,
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                    }}
                  >
                    <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                      {x("My Tasks", "मेरे टास्क")}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={toggleManagerTeam}
                    style={{
                      borderWidth: 1,
                      borderColor: managerShowTeam ? DairyColors.primary : DairyColors.border,
                      backgroundColor: managerShowTeam ? DairyColors.primarySoft : DairyColors.surface,
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                    }}
                  >
                    <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                      {x("My Team Tasks", "मेरी टीम के टास्क")}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Pressable
                onPress={() => setMineOnly((v) => !v)}
                style={{
                  marginTop: 8,
                  alignSelf: "flex-start",
                  borderWidth: 1,
                  borderColor: mineOnly ? DairyColors.primary : DairyColors.border,
                  backgroundColor: mineOnly ? DairyColors.primarySoft : DairyColors.surface,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                  {mineOnly ? x("Showing mine only", "सिर्फ मेरे टास्क") : x("Show mine only", "सिर्फ मेरे टास्क दिखाएं")}
                </Text>
              </Pressable>
            )}

            <View
              style={{
                marginTop: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: DairyColors.border,
                backgroundColor: DairyColors.surface,
                padding: 10,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                {x("Add Task", "टास्क जोड़ें")}
              </Text>
              <TextInput
                value={taskTitle}
                onChangeText={setTaskTitle}
                placeholder={x("Task title", "टास्क नाम")}
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
              <TextInput
                value={taskDetails}
                onChangeText={setTaskDetails}
                placeholder={x("Details (optional)", "विवरण (वैकल्पिक)")}
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

              <Text style={{ marginTop: 8, color: DairyColors.textSecondary, fontWeight: "700" }}>
                {x("Task Type", "टास्क टाइप")}
              </Text>
              <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {TASK_TYPES.map((type) => (
                  <Pressable
                    key={`create-type-${type}`}
                    onPress={() => setTaskType(type)}
                    style={{
                      borderWidth: 1,
                      borderColor: taskType === type ? DairyColors.primary : DairyColors.border,
                      backgroundColor: taskType === type ? DairyColors.primarySoft : DairyColors.surface,
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                    }}
                  >
                    <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{taskTypeLabel(type)}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={{ marginTop: 8, color: DairyColors.textSecondary, fontWeight: "700" }}>
                {x("Priority", "प्राथमिकता")}
              </Text>
              <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {TASK_PRIORITIES.map((priority) => (
                  <Pressable
                    key={`create-priority-${priority}`}
                    onPress={() => setTaskPriority(priority)}
                    style={{
                      borderWidth: 1,
                      borderColor: taskPriority === priority ? DairyColors.primary : DairyColors.border,
                      backgroundColor: taskPriority === priority ? DairyColors.primarySoft : DairyColors.surface,
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                    }}
                  >
                    <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{taskPriorityLabel(priority)}</Text>
                  </Pressable>
                ))}
              </View>

              {canManageAll ? (
                <>
                  <Text style={{ marginTop: 8, color: DairyColors.textSecondary, fontWeight: "700" }}>
                    {x("Assign Role", "असाइन रोल")}
                  </Text>
                  <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {TASK_ASSIGNEE_ROLES.map((role) => (
                      <Pressable
                        key={`create-role-${role}`}
                        onPress={() => setTaskAssignedRole(role)}
                        style={{
                          borderWidth: 1,
                          borderColor: taskAssignedRole === role ? DairyColors.primary : DairyColors.border,
                          backgroundColor: taskAssignedRole === role ? DairyColors.primarySoft : DairyColors.surface,
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 7,
                        }}
                      >
                        <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{roleLabel(role)}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={{ marginTop: 8, color: DairyColors.textSecondary, fontWeight: "700" }}>
                    {x("Assign User (optional)", "यूज़र असाइन (वैकल्पिक)")}
                  </Text>
                  <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    <Pressable
                      onPress={() => setTaskAssignedToUsername("")}
                      style={{
                        borderWidth: 1,
                        borderColor: taskAssignedToUsername === "" ? DairyColors.primary : DairyColors.border,
                        backgroundColor: taskAssignedToUsername === "" ? DairyColors.primarySoft : DairyColors.surface,
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                      }}
                    >
                      <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                        {x("Unassigned", "अनअसाइन्ड")}
                      </Text>
                    </Pressable>
                    {usersForSelectedRole.map((row) => (
                      <Pressable
                        key={`create-user-${row.username}`}
                        onPress={() => setTaskAssignedToUsername(row.username)}
                        style={{
                          borderWidth: 1,
                          borderColor: taskAssignedToUsername === row.username ? DairyColors.primary : DairyColors.border,
                          backgroundColor: taskAssignedToUsername === row.username ? DairyColors.primarySoft : DairyColors.surface,
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 7,
                        }}
                      >
                        <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{row.username}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              <TextInput
                value={taskDueTime}
                onChangeText={setTaskDueTime}
                placeholder={x("Due time HH:MM (optional)", "समय HH:MM (वैकल्पिक)")}
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
                disabled={saving}
                onPress={() => void createTask()}
                style={{
                  marginTop: 8,
                  borderRadius: 10,
                  padding: 12,
                  alignItems: "center",
                  backgroundColor: saving ? DairyColors.textSecondary : DairyColors.primary,
                }}
              >
                <Text style={{ color: "white", fontWeight: "800" }}>
                  {saving ? x("Saving...", "सेव हो रहा है...") : x("Add Task", "टास्क जोड़ें")}
                </Text>
              </Pressable>
            </View>

            <Text style={{ marginTop: 12, color: DairyColors.textSecondary, fontWeight: "700" }}>
              {x("Task List", "टास्क लिस्ट")}
            </Text>
          </>
        }
        renderItem={({ item }) => (
          <View
            style={{
              borderWidth: 1,
              borderColor: DairyColors.border,
              borderRadius: 10,
              padding: 10,
              backgroundColor: DairyColors.surface,
            }}
          >
            <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>{item.title}</Text>
            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
              {item.taskDate} | {taskTypeLabel(item.taskType)} | {taskPriorityLabel(item.priority)}
            </Text>
            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
              {x("Assigned", "असाइन्ड")}: {roleLabel(item.assignedRole)} |{" "}
              {item.assignedToUsername ?? x("Unassigned", "अनअसाइन्ड")} | {taskStatusLabel(item.status)}
            </Text>
            {item.details ? <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>{item.details}</Text> : null}
            <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {statusOptionsForTask(item).map((status) => (
                <Pressable
                  key={`${item.taskId}-${status}`}
                  onPress={() => void updateTaskStatus(item.taskId, status)}
                  style={{
                    borderWidth: 1,
                    borderColor: item.status === status ? DairyColors.primary : DairyColors.border,
                    backgroundColor: item.status === status ? DairyColors.primarySoft : DairyColors.surfaceMuted,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{taskStatusLabel(status)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ color: DairyColors.textSecondary }}>
            {x("No tasks for selected date.", "चुनी तारीख के लिए कोई टास्क नहीं है।")}
          </Text>
        }
      />
    </View>
  );
}
