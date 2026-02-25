import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { DairyColors } from "../../constants/dairy-theme";
import {
  WorklistApi,
  WorklistDueStatus,
  WorklistPriority,
  WorklistResponse,
  WorklistTaskType,
} from "../../services/api";
import { useI18n } from "../../state/i18n";
import { todayLocalISO } from "../../utils/date";

type FilterKey = "ALL" | "HIGH" | "OVERDUE";

function priorityTone(priority: WorklistPriority) {
  if (priority === "HIGH") {
    return { bg: DairyColors.dangerSoft, text: DairyColors.danger };
  }
  if (priority === "MEDIUM") {
    return { bg: DairyColors.warningSoft, text: DairyColors.warning };
  }
  return { bg: DairyColors.successSoft, text: DairyColors.success };
}

function statusTone(status: WorklistDueStatus) {
  if (status === "OVERDUE") {
    return { bg: DairyColors.dangerSoft, text: DairyColors.danger };
  }
  if (status === "DUE_TODAY") {
    return { bg: DairyColors.warningSoft, text: DairyColors.warning };
  }
  if (status === "DUE_SOON") {
    return { bg: DairyColors.infoSoft, text: DairyColors.info };
  }
  return { bg: DairyColors.successSoft, text: DairyColors.success };
}

export default function WorklistScreen() {
  const { x } = useI18n();
  const [date] = useState(todayLocalISO());
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [response, setResponse] = useState<WorklistResponse | null>(null);

  const priorityLabel = (priority: WorklistPriority) => {
    if (priority === "HIGH") return x("High", "उच्च");
    if (priority === "MEDIUM") return x("Medium", "मध्यम");
    return x("Low", "कम");
  };

  const dueStatusLabel = (status: WorklistDueStatus) => {
    if (status === "OVERDUE") return x("Overdue", "समय से बाकी");
    if (status === "DUE_TODAY") return x("Due Today", "आज देय");
    if (status === "DUE_SOON") return x("Due Soon", "जल्द देय");
    return x("Info", "जानकारी");
  };

  const taskTypeLabel = (type: WorklistTaskType) => {
    if (type === "VACCINATION_DUE") return x("Vaccination", "टीकाकरण");
    if (type === "DEWORMING_DUE") return x("Deworming", "पेट की दवा");
    if (type === "PREGNANCY_CHECK_DUE") return x("Pregnancy Check", "गर्भ जांच");
    if (type === "CALVING_DUE") return x("Calving", "बछड़ा तैयारी");
    if (type === "REPEAT_BREEDER") return x("Repeat Breeder", "बार-बार असफल प्रजनन");
    if (type === "MASTITIS_FOLLOW_UP") return x("Mastitis Follow-up", "मैस्टाइटिस फॉलो-अप");
    return x("Low Yield", "कम दूध उत्पादन");
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await WorklistApi.today(date, 7);
      setResponse(res);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load today worklist.", "आज की काम सूची लोड नहीं हो पाई।")
      );
    } finally {
      setLoading(false);
    }
  }, [date, x]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredItems = useMemo(() => {
    const items = response?.items ?? [];
    if (filter === "HIGH") {
      return items.filter((item) => item.priority === "HIGH");
    }
    if (filter === "OVERDUE") {
      return items.filter((item) => item.dueStatus === "OVERDUE");
    }
    return items;
  }, [filter, response?.items]);

  const cards = [
    {
      key: "total",
      label: x("Total Tasks", "कुल काम"),
      value: response?.totalTasks ?? 0,
      bg: DairyColors.surfaceMuted,
      text: DairyColors.textPrimary,
    },
    {
      key: "high",
      label: x("High Priority", "उच्च प्राथमिकता"),
      value: response?.highPriorityCount ?? 0,
      bg: DairyColors.dangerSoft,
      text: DairyColors.danger,
    },
    {
      key: "overdue",
      label: x("Overdue", "समय से बाकी"),
      value: response?.overdueCount ?? 0,
      bg: DairyColors.warningSoft,
      text: DairyColors.warning,
    },
    {
      key: "dueSoon",
      label: x("Due Soon", "जल्द देय"),
      value: response?.dueSoonCount ?? 0,
      bg: DairyColors.infoSoft,
      text: DairyColors.info,
    },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: DairyColors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
            {x("Today Worklist", "आज की काम सूची")}
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x("Auto alerts from health, breeding and milk records", "सेहत, प्रजनन और दूध रिकॉर्ड से ऑटो अलर्ट")}
          </Text>
        </View>

        <Pressable
          onPress={load}
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

      <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {cards.map((card) => (
          <View
            key={card.key}
            style={{
              flex: 1,
              minWidth: 140,
              borderRadius: 12,
              backgroundColor: card.bg,
              padding: 10,
            }}
          >
            <Text style={{ color: DairyColors.textSecondary }}>{card.label}</Text>
            <Text style={{ marginTop: 4, fontWeight: "800", fontSize: 20, color: card.text }}>{card.value}</Text>
          </View>
        ))}
      </View>

      <View style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
        {([
          { key: "ALL", label: x("All", "सभी") },
          { key: "HIGH", label: x("High", "उच्च") },
          { key: "OVERDUE", label: x("Overdue", "समय से बाकी") },
        ] as { key: FilterKey; label: string }[]).map((chip) => {
          const selected = chip.key === filter;
          return (
            <Pressable
              key={chip.key}
              onPress={() => setFilter(chip.key)}
              style={{
                borderWidth: 1,
                borderColor: selected ? DairyColors.primary : DairyColors.border,
                backgroundColor: selected ? DairyColors.primarySoft : DairyColors.surface,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{chip.label}</Text>
            </Pressable>
          );
        })}
      </View>

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
          {x("Action Items", "एक्शन आइटम")}
        </Text>

        {filteredItems.length === 0 ? (
          <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
            {loading
              ? x("Loading...", "लोड हो रहा है...")
              : x("No tasks for selected filter.", "चुने गए फ़िल्टर के लिए कोई काम नहीं है।")}
          </Text>
        ) : (
          filteredItems.map((item) => {
            const priority = priorityTone(item.priority);
            const due = statusTone(item.dueStatus);
            return (
              <View
                key={item.taskId}
                style={{
                  marginTop: 10,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  borderRadius: 10,
                  backgroundColor: DairyColors.surfaceMuted,
                  padding: 10,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>{item.title}</Text>
                    <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                      {taskTypeLabel(item.type)}
                    </Text>
                  </View>

                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <View
                      style={{
                        borderRadius: 999,
                        backgroundColor: priority.bg,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                      }}
                    >
                      <Text style={{ color: priority.text, fontWeight: "800", fontSize: 12 }}>
                        {priorityLabel(item.priority)}
                      </Text>
                    </View>

                    <View
                      style={{
                        borderRadius: 999,
                        backgroundColor: due.bg,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                      }}
                    >
                      <Text style={{ color: due.text, fontWeight: "700", fontSize: 12 }}>
                        {dueStatusLabel(item.dueStatus)}
                      </Text>
                    </View>
                  </View>
                </View>

                <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
                  {x("Animal", "जानवर")}: {item.animalTag || item.animalId || x("Unknown", "अज्ञात")}
                </Text>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x("Due Date", "देय तारीख")}: {item.dueDate || x("Not set", "सेट नहीं")}
                </Text>
                {item.description ? (
                  <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>{item.description}</Text>
                ) : null}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
