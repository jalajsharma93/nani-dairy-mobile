import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { DairyColors } from "@/src/constants/dairy-theme";
import {
  NotificationApi,
  NotificationDeliveryStatus,
  NotificationPriority,
  NotificationResponse,
} from "@/src/services/api";
import { useAuth } from "@/src/state/auth";
import { useI18n } from "@/src/state/i18n";
import { resolveRolePermissions } from "@/src/state/permissions";

type Scope = "MINE" | "ALL";
type ReadFilter = "ALL" | "UNREAD" | "READ";
type StatusFilter = "ALL" | NotificationDeliveryStatus;
type PriorityFilter = "ALL" | NotificationPriority;

function toneForPriority(priority: NotificationPriority) {
  if (priority === "CRITICAL") return { bg: DairyColors.dangerSoft, text: DairyColors.danger };
  if (priority === "HIGH") return { bg: DairyColors.warningSoft, text: DairyColors.warning };
  if (priority === "MEDIUM") return { bg: DairyColors.infoSoft, text: DairyColors.info };
  return { bg: DairyColors.surfaceMuted, text: DairyColors.textSecondary };
}

function toneForStatus(status: NotificationDeliveryStatus) {
  if (status === "SENT") return { bg: DairyColors.successSoft, text: DairyColors.success };
  if (status === "FAILED") return { bg: DairyColors.dangerSoft, text: DairyColors.danger };
  return { bg: DairyColors.warningSoft, text: DairyColors.warning };
}

function safeDateText(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function FilterChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? DairyColors.primary : DairyColors.border,
        backgroundColor: active ? DairyColors.primarySoft : DairyColors.surface,
        paddingHorizontal: 10,
        paddingVertical: 7,
      }}
    >
      <Text
        style={{
          color: active ? DairyColors.primary : DairyColors.textSecondary,
          fontWeight: "700",
          fontSize: 12,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const { x } = useI18n();
  const { user } = useAuth();
  const permissions = resolveRolePermissions(user?.role);
  const canViewAll = permissions.isAdmin || permissions.isManager;

  const [scope, setScope] = useState<Scope>("MINE");
  const [rows, setRows] = useState<NotificationResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyNotificationId, setBusyNotificationId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const [readFilter, setReadFilter] = useState<ReadFilter>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [eventFilter, setEventFilter] = useState<string>("ALL");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const allRecipients = canViewAll && scope === "ALL";
      const [items, unread] = await Promise.all([
        NotificationApi.list({ allRecipients, limit: 400 }),
        NotificationApi.unreadCount({ allRecipients }),
      ]);
      setRows(items);
      setUnreadCount(unread.unreadCount ?? 0);
    } catch (e: any) {
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load notifications.", "नोटिफिकेशन लोड नहीं हुए।")
      );
    } finally {
      setLoading(false);
    }
  }, [canViewAll, scope, x]);

  useEffect(() => {
    void load();
  }, [load]);

  const eventTypes = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const eventType = (row.eventType ?? "").trim();
      if (eventType) set.add(eventType);
    }
    return ["ALL", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  useEffect(() => {
    if (!eventTypes.includes(eventFilter)) {
      setEventFilter("ALL");
    }
  }, [eventFilter, eventTypes]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (readFilter === "READ" && !row.read) return false;
      if (readFilter === "UNREAD" && row.read) return false;
      if (priorityFilter !== "ALL" && row.priority !== priorityFilter) return false;
      if (statusFilter !== "ALL" && row.deliveryStatus !== statusFilter) return false;
      if (eventFilter !== "ALL" && row.eventType !== eventFilter) return false;
      return true;
    });
  }, [eventFilter, priorityFilter, readFilter, rows, statusFilter]);

  const failedCount = useMemo(
    () => rows.filter((row) => row.deliveryStatus === "FAILED").length,
    [rows]
  );

  const unreadInView = useMemo(
    () => filteredRows.filter((row) => !row.read).length,
    [filteredRows]
  );

  const onMarkRead = async (notificationId: string) => {
    try {
      setBusyNotificationId(notificationId);
      const updated = await NotificationApi.markRead(notificationId);
      setRows((prev) => prev.map((row) => (row.notificationId === notificationId ? updated : row)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (e: any) {
      Alert.alert(
        x("Update failed", "अपडेट नहीं हुआ"),
        e?.message ?? x("Could not mark notification as read.", "नोटिफिकेशन पढ़ा हुआ मार्क नहीं हुआ।")
      );
    } finally {
      setBusyNotificationId(null);
    }
  };

  const onMarkAllRead = async () => {
    try {
      setBusyAll(true);
      await NotificationApi.markAllRead({ allRecipients: canViewAll && scope === "ALL" });
      await load();
    } catch (e: any) {
      Alert.alert(
        x("Update failed", "अपडेट नहीं हुआ"),
        e?.message ?? x("Could not mark all notifications as read.", "सभी नोटिफिकेशन पढ़े हुए मार्क नहीं हुए।")
      );
    } finally {
      setBusyAll(false);
    }
  };

  const onRetry = async (notificationId: string) => {
    try {
      setBusyNotificationId(notificationId);
      const updated = await NotificationApi.retry(notificationId);
      setRows((prev) => prev.map((row) => (row.notificationId === notificationId ? updated : row)));
    } catch (e: any) {
      Alert.alert(
        x("Retry failed", "रीट्राई नहीं हुआ"),
        e?.message ?? x("Could not retry this notification.", "यह नोटिफिकेशन रीट्राई नहीं हुआ।")
      );
    } finally {
      setBusyNotificationId(null);
    }
  };

  const scopeAll = canViewAll && scope === "ALL";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: DairyColors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
            {x("Notifications", "नोटिफिकेशन")}
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x("QC, delivery, billing and task alerts", "QC, डिलीवरी, बिलिंग और टास्क अलर्ट")}
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

      {canViewAll ? (
        <View
          style={{
            marginTop: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: DairyColors.border,
            backgroundColor: DairyColors.surface,
            padding: 10,
            gap: 8,
          }}
        >
          <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
            {x("Scope", "स्कोप")}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <FilterChip
              active={scope === "MINE"}
              label={x("My Notifications", "मेरे नोटिफिकेशन")}
              onPress={() => setScope("MINE")}
            />
            <FilterChip
              active={scope === "ALL"}
              label={x("All Recipients", "सभी यूज़र")}
              onPress={() => setScope("ALL")}
            />
          </View>
        </View>
      ) : null}

      <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 110, borderRadius: 12, backgroundColor: DairyColors.surfaceMuted, padding: 10 }}>
          <Text style={{ color: DairyColors.textSecondary }}>{x("Total", "कुल")}</Text>
          <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontSize: 18, fontWeight: "800" }}>
            {rows.length}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 110, borderRadius: 12, backgroundColor: DairyColors.infoSoft, padding: 10 }}>
          <Text style={{ color: DairyColors.textSecondary }}>{x("Unread", "अनरीड")}</Text>
          <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontSize: 18, fontWeight: "800" }}>
            {unreadCount}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 110, borderRadius: 12, backgroundColor: DairyColors.dangerSoft, padding: 10 }}>
          <Text style={{ color: DairyColors.textSecondary }}>{x("Failed", "फेल")}</Text>
          <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontSize: 18, fontWeight: "800" }}>
            {failedCount}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 12, gap: 8 }}>
        <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>{x("Filters", "फ़िल्टर")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <FilterChip active={readFilter === "ALL"} label={x("Read: All", "रीड: सभी")} onPress={() => setReadFilter("ALL")} />
          <FilterChip active={readFilter === "UNREAD"} label={x("Unread", "अनरीड")} onPress={() => setReadFilter("UNREAD")} />
          <FilterChip active={readFilter === "READ"} label={x("Read", "रीड")} onPress={() => setReadFilter("READ")} />
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <FilterChip active={priorityFilter === "ALL"} label={x("Priority: All", "प्राथमिकता: सभी")} onPress={() => setPriorityFilter("ALL")} />
          <FilterChip active={priorityFilter === "CRITICAL"} label="Critical" onPress={() => setPriorityFilter("CRITICAL")} />
          <FilterChip active={priorityFilter === "HIGH"} label="High" onPress={() => setPriorityFilter("HIGH")} />
          <FilterChip active={priorityFilter === "MEDIUM"} label="Medium" onPress={() => setPriorityFilter("MEDIUM")} />
          <FilterChip active={priorityFilter === "LOW"} label="Low" onPress={() => setPriorityFilter("LOW")} />
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <FilterChip active={statusFilter === "ALL"} label={x("Status: All", "स्थिति: सभी")} onPress={() => setStatusFilter("ALL")} />
          <FilterChip active={statusFilter === "SENT"} label="Sent" onPress={() => setStatusFilter("SENT")} />
          <FilterChip active={statusFilter === "FAILED"} label="Failed" onPress={() => setStatusFilter("FAILED")} />
          <FilterChip active={statusFilter === "PENDING"} label="Pending" onPress={() => setStatusFilter("PENDING")} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {eventTypes.map((event) => (
              <FilterChip
                key={event}
                active={eventFilter === event}
                label={event === "ALL" ? x("Event: All", "इवेंट: सभी") : event}
                onPress={() => setEventFilter(event)}
              />
            ))}
          </View>
        </ScrollView>
      </View>

      <View style={{ marginTop: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
          {x("Visible", "दिख रहे")}: {filteredRows.length} ({x("Unread", "अनरीड")} {unreadInView})
        </Text>
        <Pressable
          onPress={() => void onMarkAllRead()}
          disabled={busyAll}
          style={{
            borderRadius: 10,
            borderWidth: 1,
            borderColor: DairyColors.primary,
            backgroundColor: DairyColors.primarySoft,
            paddingHorizontal: 12,
            paddingVertical: 8,
            opacity: busyAll ? 0.6 : 1,
          }}
        >
          <Text style={{ color: DairyColors.primary, fontWeight: "800" }}>
            {busyAll ? x("Updating...", "अपडेट हो रहा है...") : x("Mark All Read", "सबको रीड मार्क करें")}
          </Text>
        </Pressable>
      </View>

      <View style={{ marginTop: 10, gap: 10 }}>
        {filteredRows.length === 0 ? (
          <View
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: DairyColors.border,
              backgroundColor: DairyColors.surface,
              padding: 12,
            }}
          >
            <Text style={{ color: DairyColors.textSecondary }}>
              {x("No notifications found for selected filters.", "चुने हुए फ़िल्टर के लिए नोटिफिकेशन नहीं मिले।")}
            </Text>
          </View>
        ) : null}

        {filteredRows.map((row) => {
          const priorityTone = toneForPriority(row.priority);
          const statusTone = toneForStatus(row.deliveryStatus);
          const canRetry = row.deliveryStatus === "FAILED" && row.retryCount < row.maxRetries;

          return (
            <View
              key={row.notificationId}
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: row.read ? DairyColors.border : DairyColors.primary,
                backgroundColor: row.read ? DairyColors.surface : DairyColors.primarySoft,
                padding: 12,
                gap: 8,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <Text style={{ flex: 1, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
                  {row.title}
                </Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <View style={{ borderRadius: 999, backgroundColor: priorityTone.bg, paddingHorizontal: 8, paddingVertical: 5 }}>
                    <Text style={{ color: priorityTone.text, fontWeight: "800", fontSize: 11 }}>{row.priority}</Text>
                  </View>
                  <View style={{ borderRadius: 999, backgroundColor: statusTone.bg, paddingHorizontal: 8, paddingVertical: 5 }}>
                    <Text style={{ color: statusTone.text, fontWeight: "800", fontSize: 11 }}>{row.deliveryStatus}</Text>
                  </View>
                </View>
              </View>

              <Text style={{ color: DairyColors.textPrimary }}>{row.message}</Text>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Text style={{ color: DairyColors.textSecondary, fontSize: 12 }}>
                  {x("Event", "इवेंट")}: {row.eventType}
                </Text>
                <Text style={{ color: DairyColors.textSecondary, fontSize: 12 }}>
                  {x("Channel", "चैनल")}: {row.channel}
                </Text>
                {scopeAll ? (
                  <Text style={{ color: DairyColors.textSecondary, fontSize: 12 }}>
                    {x("To", "To")}: {row.recipientUsername}
                  </Text>
                ) : null}
                <Text style={{ color: DairyColors.textSecondary, fontSize: 12 }}>
                  {x("Created", "बना")}: {safeDateText(row.createdAt)}
                </Text>
                {row.deliveryStatus === "FAILED" && row.lastError ? (
                  <Text style={{ color: DairyColors.danger, fontSize: 12 }}>
                    {x("Error", "एरर")}: {row.lastError}
                  </Text>
                ) : null}
                {row.readAt ? (
                  <Text style={{ color: DairyColors.textSecondary, fontSize: 12 }}>
                    {x("Read", "रीड")}: {safeDateText(row.readAt)}
                  </Text>
                ) : (
                  <Text style={{ color: DairyColors.warning, fontSize: 12, fontWeight: "700" }}>
                    {x("Unread", "अनरीड")}
                  </Text>
                )}
              </View>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {!row.read ? (
                  <Pressable
                    onPress={() => void onMarkRead(row.notificationId)}
                    disabled={busyNotificationId === row.notificationId}
                    style={{
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: DairyColors.primary,
                      backgroundColor: DairyColors.surface,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      opacity: busyNotificationId === row.notificationId ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ color: DairyColors.primary, fontWeight: "800" }}>
                      {busyNotificationId === row.notificationId
                        ? x("Updating...", "अपडेट...")
                        : x("Mark Read", "रीड मार्क करें")}
                    </Text>
                  </Pressable>
                ) : null}

                {canRetry ? (
                  <Pressable
                    onPress={() => void onRetry(row.notificationId)}
                    disabled={busyNotificationId === row.notificationId}
                    style={{
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: DairyColors.warning,
                      backgroundColor: DairyColors.warningSoft,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      opacity: busyNotificationId === row.notificationId ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ color: DairyColors.warning, fontWeight: "800" }}>
                      {busyNotificationId === row.notificationId ? x("Retrying...", "रीट्राई...") : x("Retry", "रीट्राई")}
                    </Text>
                  </Pressable>
                ) : null}

                {row.deliveryStatus === "FAILED" ? (
                  <Text style={{ color: DairyColors.textSecondary, fontSize: 12, alignSelf: "center" }}>
                    {x("Retries", "रीट्राई")}: {row.retryCount}/{row.maxRetries}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
