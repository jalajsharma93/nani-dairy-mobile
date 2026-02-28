import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Text, TextInput, View } from "react-native";
import {
  FeedManagementApi,
  FeedMaterialResponse,
  ProcessingStockStage,
  ProcessingStockSummaryResponse,
  ProcessingStockTxnResponse,
  StockManagerApi,
} from "../../services/api";
import { DairyColors } from "../../constants/dairy-theme";
import { useI18n } from "../../state/i18n";
import { useAuth } from "../../state/auth";
import { todayLocalISO } from "../../utils/date";

const STAGES: ProcessingStockStage[] = ["MILK", "CURD", "BUTTERMILK", "GHEE"];

const quantityLabel = (stage: ProcessingStockStage, qty: number) => {
  const unit = stage === "GHEE" || stage === "CURD" ? "kg" : "L";
  return `${qty.toFixed(2)} ${unit}`;
};

export default function StockManagerScreen() {
  const { hasAnyRole } = useAuth();
  const { x } = useI18n();
  const canManage = hasAnyRole("ADMIN", "MANAGER", "FEED_MANAGER");

  const [date, setDate] = useState(todayLocalISO());
  const [summary, setSummary] = useState<ProcessingStockSummaryResponse | null>(null);
  const [transactions, setTransactions] = useState<ProcessingStockTxnResponse[]>([]);
  const [rawMaterials, setRawMaterials] = useState<FeedMaterialResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [conversionFrom, setConversionFrom] = useState<ProcessingStockStage>("CURD");
  const [conversionTo, setConversionTo] = useState<ProcessingStockStage>("BUTTERMILK");
  const [conversionInputQty, setConversionInputQty] = useState("");
  const [conversionOutputQty, setConversionOutputQty] = useState("");
  const [conversionNotes, setConversionNotes] = useState("");

  const [adjustStage, setAdjustStage] = useState<ProcessingStockStage>("MILK");
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");

  const stageLabel = useCallback(
    (stage: ProcessingStockStage) => {
      if (stage === "MILK") return x("Milk", "दूध");
      if (stage === "CURD") return x("Curd", "दही");
      if (stage === "BUTTERMILK") return x("Buttermilk", "छाछ");
      return x("Ghee", "घी");
    },
    [x]
  );

  const txnTypeLabel = useCallback(
    (type: ProcessingStockTxnResponse["txnType"]) => {
      if (type === "AUTO_MILK_PRODUCTION") return x("Auto Milk Production", "ऑटो दूध उत्पादन");
      if (type === "AUTO_SALE_DEDUCTION") return x("Auto Sale Deduction", "ऑटो बिक्री कटौती");
      if (type === "AUTO_EOD_MILK_TO_CURD") return x("Auto EOD Milk to Curd", "ऑटो EOD दूध से दही");
      if (type === "MANUAL_CONVERSION") return x("Manual Conversion", "मैनुअल कन्वर्ज़न");
      return x("Manual Adjustment", "मैनुअल एडजस्टमेंट");
    },
    [x]
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [summaryRes, txnRows, materials] = await Promise.all([
        StockManagerApi.summary(date),
        StockManagerApi.listTransactions({ date }),
        FeedManagementApi.listMaterials(),
      ]);
      setSummary(summaryRes);
      setTransactions(txnRows);
      setRawMaterials(materials);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load stock manager data.", "स्टॉक मैनेजर डेटा लोड नहीं हुआ।")
      );
    } finally {
      setLoading(false);
    }
  }, [date, x]);

  useEffect(() => {
    void load();
  }, [load]);

  const runSync = async (autoTransferMilkToCurd: boolean) => {
    if (!canManage) {
      return;
    }
    try {
      setSaving(true);
      await StockManagerApi.syncDay({ date, autoTransferMilkToCurd });
      await load();
      Alert.alert(
        x("Sync complete", "सिंक पूरा"),
        autoTransferMilkToCurd
          ? x("Milk+sales synced and EOD milk moved to curd.", "दूध+सेल सिंक हो गया और EOD दूध दही में गया।")
          : x("Milk+sales synced. No EOD transfer done.", "दूध+सेल सिंक हो गया। EOD ट्रांसफर नहीं किया।")
      );
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Sync failed", "सिंक नहीं हुआ"),
        e?.message ?? x("Could not sync day stock.", "दिन का स्टॉक सिंक नहीं हुआ।")
      );
    } finally {
      setSaving(false);
    }
  };

  const saveConversion = async () => {
    if (!canManage) {
      return;
    }
    if (conversionFrom === conversionTo) {
      Alert.alert(
        x("Invalid stage", "गलत स्टेज"),
        x("Source and target stage cannot be same.", "सोर्स और टारगेट स्टेज एक जैसे नहीं हो सकते।")
      );
      return;
    }
    const inputQty = Number(conversionInputQty);
    const outputQty = Number(conversionOutputQty);
    if (!Number.isFinite(inputQty) || inputQty <= 0 || !Number.isFinite(outputQty) || outputQty <= 0) {
      Alert.alert(
        x("Invalid quantity", "गलत मात्रा"),
        x("Enter valid positive input and output quantities.", "सही पॉज़िटिव इनपुट और आउटपुट मात्रा दें।")
      );
      return;
    }
    try {
      setSaving(true);
      await StockManagerApi.convert({
        date,
        fromStage: conversionFrom,
        toStage: conversionTo,
        inputQty,
        outputQty,
        notes: conversionNotes.trim() || null,
      });
      setConversionInputQty("");
      setConversionOutputQty("");
      setConversionNotes("");
      await load();
      Alert.alert(x("Saved", "सेव हो गया"), x("Conversion recorded.", "कन्वर्ज़न रिकॉर्ड हो गया।"));
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not record conversion.", "कन्वर्ज़न रिकॉर्ड नहीं हुआ।")
      );
    } finally {
      setSaving(false);
    }
  };

  const saveAdjustment = async () => {
    if (!canManage) {
      return;
    }
    const delta = Number(adjustDelta);
    if (!Number.isFinite(delta) || delta === 0) {
      Alert.alert(
        x("Invalid quantity", "गलत मात्रा"),
        x("Enter non-zero adjustment quantity.", "जीरो से अलग एडजस्टमेंट मात्रा दें।")
      );
      return;
    }
    try {
      setSaving(true);
      await StockManagerApi.adjust({
        date,
        stage: adjustStage,
        quantityDelta: delta,
        notes: adjustNotes.trim() || null,
      });
      setAdjustDelta("");
      setAdjustNotes("");
      await load();
      Alert.alert(x("Saved", "सेव हो गया"), x("Adjustment recorded.", "एडजस्टमेंट रिकॉर्ड हो गया।"));
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not record adjustment.", "एडजस्टमेंट रिकॉर्ड नहीं हुआ।")
      );
    } finally {
      setSaving(false);
    }
  };

  const stageBalances = useMemo(
    () => [
      { stage: "MILK" as const, value: summary?.milkBalanceLiters ?? 0 },
      { stage: "CURD" as const, value: summary?.curdBalanceKg ?? 0 },
      { stage: "BUTTERMILK" as const, value: summary?.buttermilkBalanceLiters ?? 0 },
      { stage: "GHEE" as const, value: summary?.gheeBalanceKg ?? 0 },
    ],
    [summary]
  );

  return (
    <View style={{ flex: 1, backgroundColor: DairyColors.background }}>
      <FlatList
        data={transactions.slice(0, 40)}
        keyExtractor={(row) => row.stockTxnId}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListHeaderComponent={
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
                  {x("Stock Manager", "स्टॉक मैनेजर")}
                </Text>
                <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                  {x(
                    "Raw material + milk-to-product stage tracking",
                    "रॉ मटेरियल + दूध से प्रोडक्ट स्टेज ट्रैकिंग"
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

            <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <View style={{ flex: 1, minWidth: 120, borderRadius: 12, padding: 10, backgroundColor: DairyColors.accentSoft }}>
                <Text style={{ color: DairyColors.textSecondary }}>{x("Raw Items", "रॉ आइटम")}</Text>
                <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontSize: 18, fontWeight: "800" }}>
                  {summary?.rawMaterialItems ?? 0}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 120, borderRadius: 12, padding: 10, backgroundColor: DairyColors.dangerSoft }}>
                <Text style={{ color: DairyColors.textSecondary }}>{x("Low Stock", "लो स्टॉक")}</Text>
                <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontSize: 18, fontWeight: "800" }}>
                  {summary?.lowStockRawMaterials ?? 0}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 120, borderRadius: 12, padding: 10, backgroundColor: DairyColors.infoSoft }}>
                <Text style={{ color: DairyColors.textSecondary }}>{x("Raw Value", "रॉ वैल्यू")}</Text>
                <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontSize: 18, fontWeight: "800" }}>
                  Rs {(summary?.rawMaterialStockValue ?? 0).toFixed(2)}
                </Text>
              </View>
            </View>

            <View
              style={{
                marginTop: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: DairyColors.border,
                backgroundColor: DairyColors.surface,
                padding: 10,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                {x("Raw Material Details", "रॉ मटेरियल डिटेल")}
              </Text>
              {rawMaterials.length === 0 ? (
                <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                  {x("No raw materials found.", "कोई रॉ मटेरियल नहीं मिला।")}
                </Text>
              ) : (
                rawMaterials.slice(0, 12).map((row) => (
                  <View
                    key={row.feedMaterialId}
                    style={{
                      marginTop: 6,
                      borderWidth: 1,
                      borderColor: row.lowStock ? DairyColors.danger : DairyColors.border,
                      borderRadius: 10,
                      backgroundColor: DairyColors.surfaceMuted,
                      padding: 8,
                    }}
                  >
                    <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>{row.materialName}</Text>
                    <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                      {x("Available", "उपलब्ध")}: {row.availableQty.toFixed(2)} {row.unit} | {x("Reorder", "रीऑर्डर")}:{" "}
                      {row.reorderLevelQty.toFixed(2)} {row.unit}
                    </Text>
                  </View>
                ))
              )}
            </View>

            <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {stageBalances.map((row) => (
                <View
                  key={row.stage}
                  style={{
                    flex: 1,
                    minWidth: 130,
                    borderRadius: 12,
                    padding: 10,
                    backgroundColor: DairyColors.surface,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                  }}
                >
                  <Text style={{ color: DairyColors.textSecondary }}>{stageLabel(row.stage)}</Text>
                  <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontSize: 18, fontWeight: "800" }}>
                    {quantityLabel(row.stage, row.value)}
                  </Text>
                </View>
              ))}
            </View>

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
                {x("Daily Milk Flow", "दैनिक दूध फ्लो")}
              </Text>
              <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                {x(
                  `Produced ${summary?.milkProducedToday.toFixed(2) ?? "0.00"} L | Sold ${(summary?.milkSoldToday ?? 0).toFixed(2)} L | Suggested EOD to Curd ${(summary?.suggestedEodMilkToCurd ?? 0).toFixed(2)} L`,
                  `उत्पादन ${summary?.milkProducedToday.toFixed(2) ?? "0.00"} L | बिक्री ${(summary?.milkSoldToday ?? 0).toFixed(2)} L | सुझाया EOD दही ${(summary?.suggestedEodMilkToCurd ?? 0).toFixed(2)} L`
                )}
              </Text>
            </View>

            {canManage ? (
              <View style={{ marginTop: 12, gap: 8 }}>
                <Pressable
                  disabled={saving}
                  onPress={() => void runSync(false)}
                  style={{
                    borderRadius: 10,
                    padding: 12,
                    alignItems: "center",
                    backgroundColor: saving ? DairyColors.textSecondary : DairyColors.info,
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "800" }}>
                    {x("Sync Day (Milk + Sales)", "दिन सिंक करें (दूध + सेल)")}
                  </Text>
                </Pressable>
                <Pressable
                  disabled={saving}
                  onPress={() => void runSync(true)}
                  style={{
                    borderRadius: 10,
                    padding: 12,
                    alignItems: "center",
                    backgroundColor: saving ? DairyColors.textSecondary : DairyColors.primary,
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "800" }}>
                    {x("Sync + EOD Milk to Curd", "सिंक + EOD दूध से दही")}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {canManage ? (
              <View
                style={{
                  marginTop: 14,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  backgroundColor: DairyColors.surface,
                  padding: 10,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                  {x("Process Conversion", "प्रोसेस कन्वर्ज़न")}
                </Text>
                <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                  {x(
                    "Example: Curd -> Buttermilk or Curd -> Ghee",
                    "उदाहरण: दही -> छाछ या दही -> घी"
                  )}
                </Text>

                <Text style={{ marginTop: 8, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("From Stage", "सोर्स स्टेज")}
                </Text>
                <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {STAGES.map((stage) => (
                    <Pressable
                      key={`from-${stage}`}
                      onPress={() => setConversionFrom(stage)}
                      style={{
                        borderWidth: 1,
                        borderColor: conversionFrom === stage ? DairyColors.primary : DairyColors.border,
                        backgroundColor: conversionFrom === stage ? DairyColors.primarySoft : DairyColors.surface,
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                      }}
                    >
                      <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{stageLabel(stage)}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={{ marginTop: 8, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("To Stage", "टारगेट स्टेज")}
                </Text>
                <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {STAGES.map((stage) => (
                    <Pressable
                      key={`to-${stage}`}
                      onPress={() => setConversionTo(stage)}
                      style={{
                        borderWidth: 1,
                        borderColor: conversionTo === stage ? DairyColors.primary : DairyColors.border,
                        backgroundColor: conversionTo === stage ? DairyColors.primarySoft : DairyColors.surface,
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                      }}
                    >
                      <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{stageLabel(stage)}</Text>
                    </Pressable>
                  ))}
                </View>

                <TextInput
                  value={conversionInputQty}
                  onChangeText={setConversionInputQty}
                  keyboardType="decimal-pad"
                  placeholder={x("Input Qty", "इनपुट मात्रा")}
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
                  value={conversionOutputQty}
                  onChangeText={setConversionOutputQty}
                  keyboardType="decimal-pad"
                  placeholder={x("Output Qty", "आउटपुट मात्रा")}
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
                  value={conversionNotes}
                  onChangeText={setConversionNotes}
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
                  disabled={saving}
                  onPress={() => void saveConversion()}
                  style={{
                    marginTop: 8,
                    borderRadius: 10,
                    padding: 12,
                    alignItems: "center",
                    backgroundColor: saving ? DairyColors.textSecondary : DairyColors.primary,
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "800" }}>
                    {x("Save Conversion", "कन्वर्ज़न सेव करें")}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {canManage ? (
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
                  {x("Manual Stage Adjustment", "मैनुअल स्टेज एडजस्टमेंट")}
                </Text>
                <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                  {x("Use positive for add, negative for deduction.", "जोड़ने के लिए पॉज़िटिव, घटाने के लिए नेगेटिव दें।")}
                </Text>

                <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {STAGES.map((stage) => (
                    <Pressable
                      key={`adj-${stage}`}
                      onPress={() => setAdjustStage(stage)}
                      style={{
                        borderWidth: 1,
                        borderColor: adjustStage === stage ? DairyColors.primary : DairyColors.border,
                        backgroundColor: adjustStage === stage ? DairyColors.primarySoft : DairyColors.surface,
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                      }}
                    >
                      <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{stageLabel(stage)}</Text>
                    </Pressable>
                  ))}
                </View>

                <TextInput
                  value={adjustDelta}
                  onChangeText={setAdjustDelta}
                  keyboardType="decimal-pad"
                  placeholder={x("Quantity delta (+ / -)", "मात्रा डेल्टा (+ / -)")}
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
                  value={adjustNotes}
                  onChangeText={setAdjustNotes}
                  placeholder={x("Reason (optional)", "कारण (वैकल्पिक)")}
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
                  onPress={() => void saveAdjustment()}
                  style={{
                    marginTop: 8,
                    borderRadius: 10,
                    padding: 12,
                    alignItems: "center",
                    backgroundColor: saving ? DairyColors.textSecondary : DairyColors.info,
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "800" }}>
                    {x("Save Adjustment", "एडजस्टमेंट सेव करें")}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <Text style={{ marginTop: 14, color: DairyColors.textSecondary, fontWeight: "700" }}>
              {x("Stage Transactions", "स्टेज ट्रांजैक्शन")}
            </Text>
          </>
        }
        renderItem={({ item }) => {
          const fromText = item.fromStage ? `${stageLabel(item.fromStage)} ${item.inputQty?.toFixed(2) ?? "0.00"}` : "";
          const toText = item.toStage ? `${stageLabel(item.toStage)} ${item.outputQty?.toFixed(2) ?? "0.00"}` : "";
          return (
            <View
              style={{
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 10,
                backgroundColor: DairyColors.surface,
                padding: 10,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>{txnTypeLabel(item.txnType)}</Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {item.txnDate} | {item.actorUsername ?? "-"}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {fromText && toText
                  ? `${fromText} -> ${toText}`
                  : fromText || toText || x("No qty details", "कोई मात्रा विवरण नहीं")}
              </Text>
              {item.notes ? <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>{item.notes}</Text> : null}
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={{ color: DairyColors.textSecondary }}>
            {x("No transactions for selected date.", "चुनी तारीख के लिए कोई ट्रांजैक्शन नहीं है।")}
          </Text>
        }
      />
    </View>
  );
}
