import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { DairyColors } from "../../constants/dairy-theme";
import { useI18n } from "../../state/i18n";
import {
  clearAllPendingSyncOperations,
  clearDeadLetterSyncOperations,
  flushPendingSyncOperations,
  getPendingSyncOperations,
  getPendingSyncSummary,
  PendingSyncOperation,
  PendingSyncSummary,
  removePendingSyncOperation,
  requeueDeadLetterSyncOperations,
} from "../../utils/offline-sync";

function stateTone(state: "PENDING" | "DEAD_LETTER") {
  if (state === "DEAD_LETTER") {
    return { bg: DairyColors.dangerSoft, text: DairyColors.danger };
  }
  return { bg: DairyColors.warningSoft, text: DairyColors.warning };
}

export default function SyncCenterScreen() {
  const { x } = useI18n();
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState<PendingSyncSummary>({
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
  const [rows, setRows] = useState<PendingSyncOperation[]>([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [summaryRes, listRes] = await Promise.all([
        getPendingSyncSummary(),
        getPendingSyncOperations(300),
      ]);
      setSummary(summaryRes);
      setRows(listRes);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const syncNow = async () => {
    try {
      setSyncing(true);
      const result = await flushPendingSyncOperations();
      await load();
      Alert.alert(
        x("Sync complete", "सिंक पूरा"),
        x(
          `Processed ${result.processed} | Synced ${result.success} | Failed ${result.failed} | Remaining ${result.remaining}`,
          `प्रोसेस ${result.processed} | सिंक ${result.success} | असफल ${result.failed} | बाकी ${result.remaining}`
        )
      );
    } catch (e: any) {
      Alert.alert(
        x("Sync failed", "सिंक असफल"),
        e?.message ?? x("Could not sync pending operations.", "पेंडिंग ऑपरेशन सिंक नहीं हुए।")
      );
    } finally {
      setSyncing(false);
    }
  };

  const retryDeadLetters = async () => {
    await requeueDeadLetterSyncOperations();
    await load();
    await syncNow();
  };

  const clearDeadLetters = async () => {
    await clearDeadLetterSyncOperations();
    await load();
  };

  const clearAll = async () => {
    await clearAllPendingSyncOperations();
    await load();
  };

  const dismissOne = async (localId: string) => {
    await removePendingSyncOperation(localId);
    await load();
  };

  const qcOps = summary.qcCowUpdate + summary.qcBatchStatusUpdate;
  const salesOps =
    summary.saleSave +
    summary.saleDeliveryUpdate +
    summary.saleReconcileUpdate +
    summary.deliveryTaskCreate +
    summary.deliveryTaskStatus +
    summary.deliveryAddOn;
  const feedOps = summary.feedBulkCreate + summary.feedLogUpdate;
  const adminOps = summary.expenseSave + summary.treatmentSave + summary.genericTaskStatus;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: DairyColors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
            {x("Sync Center", "सिंक सेंटर")}
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x("Offline queue monitoring and recovery", "ऑफलाइन कतार मॉनिटरिंग और रिकवरी")}
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

      <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 120, borderRadius: 12, backgroundColor: DairyColors.surfaceMuted, padding: 10 }}>
          <Text style={{ color: DairyColors.textSecondary }}>{x("Total Queue", "कुल कतार")}</Text>
          <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>{summary.total}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 120, borderRadius: 12, backgroundColor: DairyColors.warningSoft, padding: 10 }}>
          <Text style={{ color: DairyColors.textSecondary }}>{x("Pending", "पेंडिंग")}</Text>
          <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>
            {summary.total - summary.deadLetter}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 120, borderRadius: 12, backgroundColor: DairyColors.dangerSoft, padding: 10 }}>
          <Text style={{ color: DairyColors.textSecondary }}>{x("Dead Letter", "डेड लेटर")}</Text>
          <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>
            {summary.deadLetter}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <View
          style={{
            borderRadius: 10,
            borderWidth: 1,
            borderColor: DairyColors.border,
            backgroundColor: DairyColors.surface,
            paddingHorizontal: 10,
            paddingVertical: 7,
          }}
        >
          <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
            {x(`QC ${qcOps}`, `QC ${qcOps}`)}
          </Text>
        </View>
        <View
          style={{
            borderRadius: 10,
            borderWidth: 1,
            borderColor: DairyColors.border,
            backgroundColor: DairyColors.surface,
            paddingHorizontal: 10,
            paddingVertical: 7,
          }}
        >
          <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
            {x(`Sales ${salesOps}`, `सेल्स ${salesOps}`)}
          </Text>
        </View>
        <View
          style={{
            borderRadius: 10,
            borderWidth: 1,
            borderColor: DairyColors.border,
            backgroundColor: DairyColors.surface,
            paddingHorizontal: 10,
            paddingVertical: 7,
          }}
        >
          <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
            {x(`Feed ${feedOps}`, `फीड ${feedOps}`)}
          </Text>
        </View>
        <View
          style={{
            borderRadius: 10,
            borderWidth: 1,
            borderColor: DairyColors.border,
            backgroundColor: DairyColors.surface,
            paddingHorizontal: 10,
            paddingVertical: 7,
          }}
        >
          <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
            {x(`Ops ${adminOps}`, `ऑप्स ${adminOps}`)}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Pressable
          onPress={() => void syncNow()}
          disabled={syncing}
          style={{
            borderRadius: 10,
            backgroundColor: syncing ? DairyColors.textSecondary : DairyColors.primary,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Text style={{ color: "white", fontWeight: "800" }}>
            {syncing ? x("Syncing...", "सिंक हो रहा है...") : x("Sync Pending", "पेंडिंग सिंक")}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => void retryDeadLetters()}
          style={{
            borderRadius: 10,
            borderWidth: 1,
            borderColor: DairyColors.warning,
            backgroundColor: DairyColors.warningSoft,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Text style={{ color: DairyColors.warning, fontWeight: "800" }}>{x("Retry Dead Letter", "डेड लेटर रीट्राई")}</Text>
        </Pressable>

        <Pressable
          onPress={() => void clearDeadLetters()}
          style={{
            borderRadius: 10,
            borderWidth: 1,
            borderColor: DairyColors.danger,
            backgroundColor: DairyColors.dangerSoft,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Text style={{ color: DairyColors.danger, fontWeight: "800" }}>{x("Clear Dead Letter", "डेड लेटर हटाएं")}</Text>
        </Pressable>

        <Pressable
          onPress={() => void clearAll()}
          style={{
            borderRadius: 10,
            borderWidth: 1,
            borderColor: DairyColors.textSecondary,
            backgroundColor: DairyColors.surface,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Text style={{ color: DairyColors.textSecondary, fontWeight: "800" }}>{x("Clear All", "सब हटाएं")}</Text>
        </Pressable>
      </View>

      <View style={{ marginTop: 12, gap: 8 }}>
        {rows.length === 0 ? (
          <Text style={{ color: DairyColors.textSecondary }}>
            {x("No queued operations.", "कतार में कोई ऑपरेशन नहीं है।")}
          </Text>
        ) : (
          rows.map((row) => {
            const tone = stateTone(row.state);
            return (
              <View
                key={row.localId}
                style={{
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  borderRadius: 12,
                  backgroundColor: DairyColors.surface,
                  padding: 10,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", flex: 1 }}>{row.type}</Text>
                  <View style={{ borderRadius: 999, backgroundColor: tone.bg, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ color: tone.text, fontWeight: "700" }}>{row.state}</Text>
                  </View>
                </View>

                <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                  {x("Created", "बनाया गया")}: {row.createdAt}
                </Text>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x("Attempts", "प्रयास")}: {row.attempts}
                </Text>
                {row.lastError ? (
                  <Text style={{ marginTop: 2, color: DairyColors.danger }}>{row.lastError}</Text>
                ) : null}

                <Pressable
                  onPress={() => void dismissOne(row.localId)}
                  style={{
                    marginTop: 8,
                    alignSelf: "flex-start",
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    backgroundColor: DairyColors.surfaceMuted,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                  }}
                >
                  <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>{x("Dismiss", "हटाएं")}</Text>
                </Pressable>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
