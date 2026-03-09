import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { DairyColors } from "@/src/constants/dairy-theme";
import {
  AnimalApi,
  AnimalResponse,
  DeliveryTaskApi,
  Shift as ApiShift,
  MilkApi,
  MilkBatchResponse,
  MilkEntryApi,
  StockManagerApi,
} from "@/src/services/api";
import { todayLocalISO } from "@/src/utils/date";
import {
  flushPendingSyncOperations,
  getPendingSyncSummary,
  PendingSyncSummary,
  queueMilkSaveBatchAndEntries,
  shouldQueueForOffline,
} from "@/src/utils/offline-sync";
import { useI18n } from "@/src/state/i18n";

type Shift = "AM" | "PM";

const EMPTY_VALUES: Record<string, string> = {};

const liters = (value: number) => `${value.toFixed(2)} L`;

export default function MilkEntryScreen() {
  const { x, label } = useI18n();
  const [date] = useState<string>(todayLocalISO());
  const [shift, setShift] = useState<Shift>("AM");
  const [draftByBatch, setDraftByBatch] = useState<Record<string, Record<string, string>>>({});
  const [lastSavedKey, setLastSavedKey] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [animals, setAnimals] = useState<AnimalResponse[]>([]);
  const [batch, setBatch] = useState<MilkBatchResponse | null>(null);
  const [loading, setLoading] = useState(false);
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

  const currentBatchKey = `${date}__${shift}`;
  const values = draftByBatch[currentBatchKey] ?? EMPTY_VALUES;

  const total = useMemo(
    () => Object.values(values).reduce((sum, v) => sum + (Number(v) || 0), 0),
    [values]
  );

  const enteredCount = useMemo(
    () => animals.filter((a) => (Number(values[a.animalId]) || 0) > 0).length,
    [animals, values]
  );

  const averagePerEntered = enteredCount > 0 ? total / enteredCount : 0;
  const batchLocked = batch?.qcStatus === "PASS";

  const refreshPendingSync = useCallback(async () => {
    setPendingSync(await getPendingSyncSummary());
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [animalList, batchRes] = await Promise.all([
        AnimalApi.list({ active: true, status: "LACTATING" }),
        MilkApi.getBatch(date, shift),
      ]);
      setAnimals(animalList);
      setBatch(batchRes);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load milk entry data.", "दूध एंट्री डेटा लोड नहीं हो पाया।")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, shift]);

  useEffect(() => {
    void refreshPendingSync();
  }, [refreshPendingSync]);

  const saveAll = async () => {
    if (batchLocked) {
      Alert.alert(
        x("Locked", "लॉक है"),
        x("Batch is PASS. Milk entries are locked for this shift.", "बैच PASS है। इस शिफ्ट की दूध एंट्री लॉक है।")
      );
      return;
    }

    const entries = animals.map((c) => ({
      animalId: c.animalId,
      liters: Number(values[c.animalId] ?? 0) || 0,
    }));

    if (entries.some((e) => e.liters < 0)) {
      Alert.alert(x("Invalid liters", "गलत लीटर"), x("Liters cannot be negative.", "लीटर माइनस नहीं हो सकता।"));
      return;
    }

    try {
      setSaving(true);
      const payload = {
        date,
        shift: shift as ApiShift,
        totalLiters: Number(total.toFixed(2)),
      };
      const entriesPayload = {
        date,
        shift: shift as ApiShift,
        entries,
      };
      const batchRes = await MilkApi.saveBatch(payload);
      setBatch(batchRes);

      await MilkEntryApi.saveEntries(entriesPayload);
      await DeliveryTaskApi.generateSubscriptions(date).catch((e) => {
        console.error(e);
      });
      await StockManagerApi.syncDay({
        date,
        autoTransferMilkToCurd: false,
      }).catch((e) => {
        console.error(e);
      });
      setLastSavedKey(currentBatchKey);
      Alert.alert(
        x("Saved", "सेव हो गया"),
        x(
          `Saved ${shift} milk batch, updated delivery plan and synced stock for ${date}.`,
          `${date} की ${shift} शिफ्ट दूध एंट्री सेव हुई, डिलीवरी प्लान अपडेट हुआ और स्टॉक सिंक हो गया।`
        )
      );
    } catch (e: any) {
      console.error(e);
      const message = String(e?.message ?? x("Could not save milk batch.", "दूध बैच सेव नहीं हो पाया।"));
      if (message.toLowerCase().includes("locked after qc pass")) {
        Alert.alert(
          x("Locked", "लॉक है"),
          x("Batch is PASS. Milk entries cannot be edited.", "बैच PASS है। दूध एंट्री बदली नहीं जा सकती।")
        );
        await loadData();
      } else if (shouldQueueForOffline(e)) {
        await queueMilkSaveBatchAndEntries(
          {
            date,
            shift: shift as ApiShift,
            totalLiters: Number(total.toFixed(2)),
            entries,
          },
          message
        );
        await refreshPendingSync();
        setLastSavedKey(currentBatchKey);
        Alert.alert(
          x("Saved Offline", "ऑफलाइन सेव"),
          x(
            "Network unavailable. Milk save is queued and will sync automatically.",
            "नेटवर्क उपलब्ध नहीं है। दूध सेव कतार में है और अपने-आप सिंक होगा।"
          )
        );
      } else {
        Alert.alert(x("Save failed", "सेव नहीं हुआ"), message);
      }
    } finally {
      setSaving(false);
    }
  };

  const syncPending = async () => {
    try {
      setSyncing(true);
      const result = await flushPendingSyncOperations();
      await refreshPendingSync();
      await loadData();
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
    <View style={{ flex: 1, backgroundColor: DairyColors.background }}>
      <FlatList
        data={animals}
        keyExtractor={(c) => c.animalId}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListHeaderComponent={
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
                  {x("Milk Entry", "दूध एंट्री")}
                </Text>
                <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                  {x(`Per-cow recording for ${date}`, `${date} की प्रति गाय दूध एंट्री`)}
                </Text>
              </View>
              <Pressable
                onPress={loadData}
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

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              {(["AM", "PM"] as Shift[]).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setShift(s)}
                  style={{
                    flex: 1,
                    paddingVertical: 11,
                    borderWidth: 1,
                    borderColor: shift === s ? DairyColors.primary : DairyColors.border,
                    backgroundColor: shift === s ? DairyColors.primarySoft : DairyColors.surface,
                    borderRadius: 10,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontWeight: "800", color: DairyColors.textPrimary }}>
                    {label("shift", `${s}_SHIFT`)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View
              style={{
                marginTop: 12,
                borderRadius: 16,
                backgroundColor: DairyColors.primary,
                padding: 14,
              }}
            >
              <Text style={{ color: "#DDF0E5", fontWeight: "700" }}>
                {x(`DRAFT TOTAL (${shift})`, `ड्राफ्ट कुल (${shift === "AM" ? "सुबह" : "शाम"})`)}
              </Text>
              <Text style={{ marginTop: 6, color: "white", fontSize: 30, fontWeight: "800" }}>
                {liters(total)}
              </Text>

              <View style={{ marginTop: 10, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <View
                  style={{
                    borderRadius: 999,
                    backgroundColor: DairyColors.infoSoft,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ color: DairyColors.info, fontWeight: "700" }}>
                    {x(`Cows entered: ${enteredCount}/${animals.length}`, `एंट्री गाय: ${enteredCount}/${animals.length}`)}
                  </Text>
                </View>
                <View
                  style={{
                    borderRadius: 999,
                    backgroundColor: DairyColors.accentSoft,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                    {x(`Avg: ${liters(averagePerEntered)}`, `औसत: ${liters(averagePerEntered)}`)}
                  </Text>
                </View>
                <View
                  style={{
                    borderRadius: 999,
                    backgroundColor:
                      batch?.qcStatus === "PASS"
                        ? DairyColors.successSoft
                        : batch?.qcStatus === "HOLD"
                          ? DairyColors.warningSoft
                          : batch?.qcStatus === "REJECT"
                            ? DairyColors.dangerSoft
                            : DairyColors.infoSoft,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                  }}
                >
                  <Text
                    style={{
                      color:
                        batch?.qcStatus === "PASS"
                          ? DairyColors.success
                          : batch?.qcStatus === "HOLD"
                            ? DairyColors.warning
                            : batch?.qcStatus === "REJECT"
                              ? DairyColors.danger
                              : DairyColors.info,
                      fontWeight: "700",
                    }}
                  >
                    {x(
                      `QC: ${batch?.qcStatus ?? "NO BATCH"}`,
                      `QC: ${label("qcStatus", batch?.qcStatus ?? "NO_BATCH")}`
                    )}
                  </Text>
                </View>
              </View>
            </View>

            <View
              style={{
                marginTop: 10,
                alignSelf: "flex-start",
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
                backgroundColor:
                  lastSavedKey === currentBatchKey ? DairyColors.successSoft : DairyColors.warningSoft,
              }}
            >
              <Text
                style={{
                  color: lastSavedKey === currentBatchKey ? DairyColors.success : DairyColors.warning,
                  fontWeight: "700",
                }}
              >
                {lastSavedKey === currentBatchKey
                  ? x(`Saved for ${shift}`, `${shift === "AM" ? "सुबह" : "शाम"} के लिए सेव`)
                  : x("Not saved yet", "अभी सेव नहीं हुआ")}
              </Text>
            </View>

            <View
              style={{
                marginTop: 10,
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 10,
                backgroundColor: pendingSync.milkSave > 0 ? DairyColors.warningSoft : DairyColors.successSoft,
                padding: 10,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                {pendingSync.milkSave > 0 ? x("Milk Sync Pending", "दूध सिंक बाकी") : x("Milk Synced", "दूध सिंक")}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x(
                  `Pending milk saves: ${pendingSync.milkSave} | Dead letter: ${pendingSync.deadLetter}`,
                  `पेंडिंग दूध सेव: ${pendingSync.milkSave} | डेड लेटर: ${pendingSync.deadLetter}`
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

            {batchLocked ? (
              <View
                style={{
                  marginTop: 10,
                  borderRadius: 10,
                  backgroundColor: DairyColors.successSoft,
                  padding: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Ionicons name="lock-closed" size={16} color={DairyColors.success} />
                <Text style={{ color: DairyColors.success, fontWeight: "700" }}>
                  {x("Batch is PASS. Editing is locked for this shift.", "बैच PASS है। इस शिफ्ट में बदलाव लॉक है।")}
                </Text>
              </View>
            ) : null}

            <Text style={{ marginTop: 14, marginBottom: 8, color: DairyColors.textSecondary, fontWeight: "700" }}>
              {x("Cow Entries", "गाय एंट्री")}
            </Text>
          </>
        }
        renderItem={({ item }) => {
          const litersValue = values[item.animalId] ?? "";
          const parsed = Number(litersValue);
          const hasValue = litersValue.trim().length > 0;
          const valid = !hasValue || Number.isFinite(parsed);

          return (
            <View
              style={{
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 12,
                backgroundColor: DairyColors.surface,
                padding: 10,
                opacity: batchLocked ? 0.7 : 1,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>{item.tag}</Text>
                <Text style={{ color: DairyColors.textSecondary, fontSize: 12 }}>{item.breed}</Text>
              </View>
              <TextInput
                editable={!batchLocked}
                placeholder={x("Liters", "लीटर")}
                placeholderTextColor="#9CA99A"
                keyboardType="decimal-pad"
                value={litersValue}
                onChangeText={(t) =>
                  setDraftByBatch((prev) => ({
                    ...prev,
                    [currentBatchKey]: {
                      ...(prev[currentBatchKey] ?? {}),
                      [item.animalId]: t,
                    },
                  }))
                }
                style={{
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: valid ? DairyColors.border : DairyColors.danger,
                  padding: 10,
                  borderRadius: 10,
                  color: DairyColors.textPrimary,
                  backgroundColor: DairyColors.surfaceMuted,
                }}
              />
              {!valid ? (
                <Text style={{ marginTop: 4, color: DairyColors.danger }}>
                  {x("Enter a valid number.", "सही संख्या डालें।")}
                </Text>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={{ marginTop: 10, color: DairyColors.textSecondary }}>
            {loading
              ? x("Loading animals...", "जानवर लोड हो रहे हैं...")
              : x("No active lactating animals found.", "कोई सक्रिय दूध देने वाला जानवर नहीं मिला।")}
          </Text>
        }
        ListFooterComponent={
          <>
            <Pressable
              disabled={saving || batchLocked}
              onPress={saveAll}
              style={{
                marginTop: 14,
                padding: 14,
                borderRadius: 12,
                backgroundColor:
                  saving || batchLocked ? DairyColors.textSecondary : DairyColors.primary,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "white", fontWeight: "800" }}>
                {saving
                  ? x("Saving...", "सेव हो रहा है...")
                  : batchLocked
                    ? x("Locked After PASS", "PASS के बाद लॉक")
                    : x(`Save ${shift} Entries`, `${shift === "AM" ? "सुबह" : "शाम"} एंट्री सेव करें`)}
              </Text>
            </Pressable>

            <View
              style={{
                marginTop: 10,
                borderRadius: 10,
                backgroundColor: DairyColors.infoSoft,
                padding: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Ionicons name="information-circle" size={16} color={DairyColors.info} />
              <Text style={{ color: DairyColors.info }}>
                {x("Saving same date + shift updates the existing batch.", "एक ही तारीख और शिफ्ट फिर सेव करने से वही बैच अपडेट होगा।")}
              </Text>
            </View>
          </>
        }
      />
    </View>
  );
}
