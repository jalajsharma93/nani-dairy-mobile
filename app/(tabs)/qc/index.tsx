import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  AnimalApi,
  AnimalResponse,
  MilkApi,
  MilkBatchResponse,
  MilkEntryApi,
  QcStatus,
  Shift,
} from "../../services/api";
import { DairyColors } from "../../constants/dairy-theme";
import { todayLocalISO } from "../../utils/date";
import { useAuth } from "../../state/auth";
import { useI18n } from "../../state/i18n";
import { ReadOnlyBanner } from "../../../components/read-only-banner";

type CowQcStatus = Exclude<QcStatus, "PENDING">;
type CowQcDraft = {
  qcStatus?: CowQcStatus;
  fat: string;
  snf: string;
  temperature: string;
  lactometer: string;
  smellNotes: string;
  rejectionReason: string;
};

const EMPTY_DRAFT: CowQcDraft = {
  fat: "",
  snf: "",
  temperature: "",
  lactometer: "",
  smellNotes: "",
  rejectionReason: "",
};
const EMPTY_DRAFTS: Record<string, CowQcDraft> = {};

function statusTone(status?: QcStatus | null) {
  if (status === "PASS") {
    return { text: DairyColors.success, background: DairyColors.successSoft };
  }
  if (status === "HOLD") {
    return { text: DairyColors.warning, background: DairyColors.warningSoft };
  }
  if (status === "REJECT") {
    return { text: DairyColors.danger, background: DairyColors.dangerSoft };
  }
  return { text: DairyColors.info, background: DairyColors.infoSoft };
}

function progressPercent(done: number, total: number) {
  if (total <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, done / total));
}

function parseOptionalNumber(value: string, labelName: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${labelName} must be a valid non-negative number`);
  }
  return parsed;
}

export default function QualityCheckScreen() {
  const { hasAnyRole } = useAuth();
  const { x, label, t } = useI18n();
  const canApproveBatch = hasAnyRole("ADMIN", "MANAGER");

  const [date] = useState<string>(todayLocalISO());
  const [shift, setShift] = useState<Shift>("AM");

  const [batch, setBatch] = useState<MilkBatchResponse | null>(null);
  const [animals, setAnimals] = useState<AnimalResponse[]>([]);
  const [selectedAnimalId, setSelectedAnimalId] = useState<string>("");
  const [showAnimalPicker, setShowAnimalPicker] = useState(false);

  const [draftsByBatch, setDraftsByBatch] = useState<Record<string, Record<string, CowQcDraft>>>({});
  const [step1SavedByBatch, setStep1SavedByBatch] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [savingStep1, setSavingStep1] = useState(false);
  const [updating, setUpdating] = useState<QcStatus | "">("");

  const batchKey = `${date}__${shift}`;
  const drafts = draftsByBatch[batchKey] ?? EMPTY_DRAFTS;

  const selectedAnimal = animals.find((a) => a.animalId === selectedAnimalId) ?? null;
  const selectedDraft = selectedAnimal ? drafts[selectedAnimal.animalId] ?? EMPTY_DRAFT : EMPTY_DRAFT;

  const batchLocked = batch?.qcStatus === "PASS";
  const canEditQc = canApproveBatch && !batchLocked;

  const loadData = async () => {
    try {
      setLoading(true);
      const [batchRes, animalsRes, entryRes] = await Promise.all([
        MilkApi.getBatch(date, shift),
        AnimalApi.list({ active: true, status: "LACTATING" }),
        MilkEntryApi.list(date, shift),
      ]);

      setBatch(batchRes);
      setAnimals(animalsRes);
      if (animalsRes.length > 0 && !animalsRes.some((a) => a.animalId === selectedAnimalId)) {
        setSelectedAnimalId(animalsRes[0].animalId);
      }

      const mapped: Record<string, CowQcDraft> = {};
      for (const entry of entryRes) {
        mapped[entry.animalId] = {
          qcStatus: entry.qcStatus === "PENDING" ? undefined : (entry.qcStatus as CowQcStatus),
          fat: entry.fat == null ? "" : String(entry.fat),
          snf: entry.snf == null ? "" : String(entry.snf),
          temperature: entry.temperature == null ? "" : String(entry.temperature),
          lactometer: entry.lactometer == null ? "" : String(entry.lactometer),
          smellNotes: entry.smellNotes ?? "",
          rejectionReason: entry.rejectionReason ?? "",
        };
      }

      setDraftsByBatch((prev) => ({ ...prev, [batchKey]: mapped }));
      const reviewed = animalsRes.filter((a) => !!mapped[a.animalId]?.qcStatus).length;
      setStep1SavedByBatch((prev) => ({
        ...prev,
        [batchKey]: reviewed > 0,
      }));
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load QC data", "QC डेटा लोड नहीं हो पाया")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, shift]);

  const setDraft = (animalId: string, patch: Partial<CowQcDraft>) => {
    if (!canEditQc) {
      return;
    }
    setDraftsByBatch((prev) => ({
      ...prev,
      [batchKey]: {
        ...(prev[batchKey] ?? {}),
        [animalId]: {
          ...EMPTY_DRAFT,
          ...(prev[batchKey]?.[animalId] ?? {}),
          ...patch,
        },
      },
    }));
    setStep1SavedByBatch((prev) => ({ ...prev, [batchKey]: false }));
  };

  const reviewedCount = animals.filter((a) => !!drafts[a.animalId]?.qcStatus).length;
  const anyCowReviewed = reviewedCount > 0;
  const allCowsReviewed = animals.length > 0 && reviewedCount === animals.length;
  const step1Saved = !!step1SavedByBatch[batchKey];
  const step1Progress = progressPercent(reviewedCount, animals.length);

  const recommendedOverall: CowQcStatus | null = useMemo(() => {
    if (!anyCowReviewed) return null;
    const statuses = animals
      .map((a) => drafts[a.animalId]?.qcStatus)
      .filter(Boolean) as CowQcStatus[];
    if (statuses.includes("REJECT")) return "REJECT";
    if (statuses.includes("HOLD")) return "HOLD";
    return "PASS";
  }, [anyCowReviewed, animals, drafts]);

  const saveStep1 = async () => {
    if (batchLocked) {
      Alert.alert(x("Locked", "लॉक है"), x("Batch is PASS. Step 1 QC is locked.", "बैच PASS है। स्टेप 1 QC लॉक है।"));
      return;
    }

    if (!canApproveBatch) {
      Alert.alert(
        x("Role restricted", "रोल अनुमति नहीं"),
        x("Only ADMIN or MANAGER users can submit QC.", "QC जमा सिर्फ ADMIN या MANAGER कर सकता है।")
      );
      return;
    }

    if (!batch) {
      Alert.alert(x("Missing batch", "बैच नहीं मिला"), x("Save milk batch first before QC.", "QC से पहले दूध बैच सेव करें।"));
      return;
    }
    if (!anyCowReviewed) {
      Alert.alert(
        x("Step 1 incomplete", "स्टेप 1 अधूरा"),
        x("Review at least one cow before saving Step 1.", "स्टेप 1 सेव करने से पहले कम से कम एक गाय की जांच करें।")
      );
      return;
    }

    try {
      setSavingStep1(true);
      const entries = animals.flatMap((animal) => {
        const d = drafts[animal.animalId] ?? EMPTY_DRAFT;
        const hasMetrics =
          !!d.fat.trim() ||
          !!d.snf.trim() ||
          !!d.temperature.trim() ||
          !!d.lactometer.trim() ||
          !!d.smellNotes.trim() ||
          !!d.rejectionReason.trim();
        const effectiveStatus = d.qcStatus ?? (hasMetrics ? "HOLD" : undefined);
        if (!effectiveStatus) {
          return [];
        }
        return [
          {
            animalId: animal.animalId,
            qcStatus: effectiveStatus as QcStatus,
            fat: parseOptionalNumber(d.fat, "Fat"),
            snf: parseOptionalNumber(d.snf, "SNF"),
            temperature: parseOptionalNumber(d.temperature, "Temperature"),
            lactometer: parseOptionalNumber(d.lactometer, "Lactometer"),
            smellNotes: d.smellNotes.trim() || null,
            rejectionReason: d.rejectionReason.trim() || null,
          },
        ];
      });

      if (entries.length === 0) {
        Alert.alert(
          x("Nothing to save", "सेव करने के लिए कुछ नहीं"),
          x("Set status or QC details for at least one cow.", "कम से कम एक गाय का स्टेटस या QC विवरण भरें।")
        );
        return;
      }

      await MilkEntryApi.updateQc({
        date,
        shift,
        entries,
      });
      setStep1SavedByBatch((prev) => ({ ...prev, [batchKey]: true }));
      Alert.alert(x("Step 1 saved", "स्टेप 1 सेव"), x("Per-cow QC saved successfully.", "प्रति गाय QC सफलतापूर्वक सेव हुआ।"));
    } catch (e: any) {
      console.error(e);
      const message = String(e?.message ?? x("Could not save per-cow QC details", "प्रति गाय QC विवरण सेव नहीं हो पाया"));
      if (message.includes("HTTP 403")) {
        Alert.alert(
          x("Role restricted", "रोल अनुमति नहीं"),
          x("Only ADMIN or MANAGER users can submit QC.", "QC जमा सिर्फ ADMIN या MANAGER कर सकता है।")
        );
        return;
      }
      if (message.toLowerCase().includes("non-negative number")) {
        Alert.alert(
          x("Invalid values", "गलत मान"),
          x("Fat/SNF/temperature/lactometer must be valid non-negative numbers.", "फैट/SNF/तापमान/लैक्टोमीटर सही non-negative संख्या हों।")
        );
        return;
      }
      if (message.toLowerCase().includes("locked after qc pass")) {
        Alert.alert(
          x("Locked", "लॉक है"),
          x("Batch is PASS. Step 1 QC cannot be edited.", "बैच PASS है। स्टेप 1 QC बदला नहीं जा सकता।")
        );
        await loadData();
      } else {
        Alert.alert(x("Save failed", "सेव नहीं हुआ"), message);
      }
    } finally {
      setSavingStep1(false);
    }
  };

  const updateStatus = async (status: QcStatus) => {
    if (batchLocked) {
      Alert.alert(
        x("Locked", "लॉक है"),
        x("Batch is PASS. Overall QC is locked.", "बैच PASS है। ओवरऑल QC लॉक है।")
      );
      return;
    }

    if (!canApproveBatch) {
      Alert.alert(
        x("Role restricted", "रोल अनुमति नहीं"),
        x("Only ADMIN or MANAGER users can approve batch QC.", "बैच QC मंजूरी सिर्फ ADMIN या MANAGER कर सकता है।")
      );
      return;
    }

    if (!step1Saved || !anyCowReviewed) {
      Alert.alert(
        x("Step 1 required", "स्टेप 1 जरूरी"),
        x("Save Step 1 per-cow QC before setting overall status.", "ओवरऑल स्टेटस से पहले स्टेप 1 प्रति गाय QC सेव करें।")
      );
      return;
    }
    if (status === "PASS" && !allCowsReviewed) {
      Alert.alert(
        x("Review pending", "जांच बाकी"),
        x("PASS requires all cows to be reviewed in Step 1.", "PASS देने के लिए सभी गायों की Step 1 जांच जरूरी है।")
      );
      return;
    }

    try {
      setUpdating(status);
      const res = await MilkApi.updateQc({ date, shift, qcStatus: status });
      setBatch(res);
      Alert.alert(
        x("Updated", "अपडेट हुआ"),
        x(`Overall QC set to ${status}`, `ओवरऑल QC ${status} किया गया`)
      );
    } catch (e: any) {
      console.error(e);
      const message = String(e?.message ?? x("Could not update overall QC status", "ओवरऑल QC अपडेट नहीं हो पाया"));
      if (message.includes("HTTP 403")) {
        Alert.alert(
          x("Role restricted", "रोल अनुमति नहीं"),
          x("Only ADMIN or MANAGER users can approve batch QC.", "बैच QC मंजूरी सिर्फ ADMIN या MANAGER कर सकता है।")
        );
        return;
      }
      if (message.toLowerCase().includes("locked after qc pass")) {
        Alert.alert(
          x("Locked", "लॉक है"),
          x("Batch is PASS. Overall QC cannot be changed.", "बैच PASS है। ओवरऑल QC नहीं बदला जा सकता।")
        );
        await loadData();
      } else {
        Alert.alert(x("Update failed", "अपडेट नहीं हुआ"), message);
      }
    } finally {
      setUpdating("");
    }
  };

  const batchTone = statusTone(batch?.qcStatus);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: DairyColors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
            {x("Quality Check", "क्वालिटी जांच")}
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x(`Two-step review for ${date}`, `${date} के लिए दो-स्टेप जांच`)}
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
          <Text style={{ fontWeight: "800", color: DairyColors.textPrimary }}>{label("shift", `${s}_SHIFT`)}</Text>
          </Pressable>
        ))}
      </View>

      <View
        style={{
          marginTop: 14,
          backgroundColor: DairyColors.surface,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: DairyColors.border,
          padding: 12,
        }}
      >
        <Text style={{ color: DairyColors.textSecondary }}>{x("Batch Total", "बैच कुल")}</Text>
        <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontSize: 24, fontWeight: "800" }}>
          {(batch?.totalLiters ?? 0).toFixed(2)} L
        </Text>
        <View
          style={{
            marginTop: 10,
            alignSelf: "flex-start",
            borderRadius: 999,
            backgroundColor: batchTone.background,
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}
        >
          <Text style={{ color: batchTone.text, fontWeight: "700" }}>
            {x(
              `Overall QC: ${loading ? "Loading..." : batch?.qcStatus ?? "NO BATCH"}`,
              `ओवरऑल QC: ${
                loading
                  ? "लोड हो रहा है..."
                  : label("qcStatus", batch?.qcStatus ?? "NO_BATCH")
              }`
            )}
          </Text>
        </View>
      </View>

      {!canApproveBatch ? <ReadOnlyBanner subtitle={t("common.manageRestricted")} /> : null}

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
            {x("Batch is PASS. Per-cow and overall QC edits are locked.", "बैच PASS है। प्रति गाय और ओवरऑल QC दोनों लॉक हैं।")}
          </Text>
        </View>
      ) : null}

      <View
        style={{
          marginTop: 14,
          backgroundColor: DairyColors.surface,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: DairyColors.border,
          padding: 12,
          opacity: batchLocked ? 0.75 : 1,
        }}
      >
        <Text style={{ fontWeight: "800", color: DairyColors.textPrimary }}>
          {x("Step 1: Per-Cow QC", "स्टेप 1: प्रति गाय QC")}
        </Text>
        <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
          {x(`Reviewed ${reviewedCount}/${animals.length}`, `जांच हुई ${reviewedCount}/${animals.length}`)}
        </Text>
        <View style={{ marginTop: 8, height: 8, borderRadius: 999, backgroundColor: DairyColors.backgroundAlt, overflow: "hidden" }}>
          <View
            style={{
              width: `${step1Progress * 100}%`,
              height: "100%",
              backgroundColor: DairyColors.info,
              borderRadius: 999,
            }}
          />
        </View>

        <Pressable
          onPress={() => setShowAnimalPicker((s) => !s)}
          style={{
            marginTop: 10,
            borderWidth: 1,
            borderColor: DairyColors.border,
            borderRadius: 10,
            padding: 11,
            backgroundColor: DairyColors.surfaceMuted,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
            {selectedAnimal ? x(`Cow: ${selectedAnimal.tag}`, `गाय: ${selectedAnimal.tag}`) : x("Select Cow", "गाय चुनें")}
          </Text>
          <Ionicons name={showAnimalPicker ? "chevron-up" : "chevron-down"} size={18} color={DairyColors.textSecondary} />
        </Pressable>

        {showAnimalPicker ? (
          <View style={{ marginTop: 8, borderWidth: 1, borderColor: DairyColors.border, borderRadius: 10, backgroundColor: DairyColors.surface }}>
            {animals.map((animal, index) => (
              <Pressable
                key={animal.animalId}
                onPress={() => {
                  setSelectedAnimalId(animal.animalId);
                  setShowAnimalPicker(false);
                }}
                style={{
                  padding: 10,
                  borderBottomWidth: index === animals.length - 1 ? 0 : 1,
                  borderBottomColor: DairyColors.border,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary }}>{animal.tag}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {selectedAnimal ? (
          <View style={{ marginTop: 10, borderRadius: 12, backgroundColor: DairyColors.surfaceMuted, padding: 10 }}>
            {canApproveBatch ? (
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {(["PASS", "HOLD", "REJECT"] as CowQcStatus[]).map((s) => {
                  const tone = statusTone(s);
                  const selected = selectedDraft.qcStatus === s;
                  return (
                    <Pressable
                      key={s}
                      disabled={!canEditQc}
                      onPress={() => setDraft(selectedAnimal.animalId, { qcStatus: s })}
                      style={{
                        paddingVertical: 7,
                        paddingHorizontal: 12,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: selected ? tone.text : DairyColors.border,
                        backgroundColor: selected ? tone.background : DairyColors.surface,
                        opacity: canEditQc ? 1 : 0.5,
                      }}
                    >
                      <Text style={{ color: selected ? tone.text : DairyColors.textPrimary, fontWeight: "800" }}>
                        {label("qcStatus", s)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
                {x(
                  `Status: ${selectedDraft.qcStatus ?? "Not set"}`,
                  `स्थिति: ${selectedDraft.qcStatus ? label("qcStatus", selectedDraft.qcStatus) : "सेट नहीं"}`
                )}
              </Text>
            )}

            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <TextInput
                editable={canEditQc}
                style={{
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  borderRadius: 10,
                  padding: 9,
                  flex: 1,
                  color: DairyColors.textPrimary,
                  backgroundColor: DairyColors.surface,
                }}
                placeholder={x("Fat", "फैट")}
                placeholderTextColor="#99A99A"
                keyboardType="decimal-pad"
                value={selectedDraft.fat}
                onChangeText={(v) => setDraft(selectedAnimal.animalId, { fat: v })}
              />
              <TextInput
                editable={canEditQc}
                style={{
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  borderRadius: 10,
                  padding: 9,
                  flex: 1,
                  color: DairyColors.textPrimary,
                  backgroundColor: DairyColors.surface,
                }}
                placeholder={x("SNF", "SNF")}
                placeholderTextColor="#99A99A"
                keyboardType="decimal-pad"
                value={selectedDraft.snf}
                onChangeText={(v) => setDraft(selectedAnimal.animalId, { snf: v })}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <TextInput
                editable={canEditQc}
                style={{
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  borderRadius: 10,
                  padding: 9,
                  flex: 1,
                  color: DairyColors.textPrimary,
                  backgroundColor: DairyColors.surface,
                }}
                placeholder={x("Temp", "तापमान")}
                placeholderTextColor="#99A99A"
                keyboardType="decimal-pad"
                value={selectedDraft.temperature}
                onChangeText={(v) => setDraft(selectedAnimal.animalId, { temperature: v })}
              />
              <TextInput
                editable={canEditQc}
                style={{
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  borderRadius: 10,
                  padding: 9,
                  flex: 1,
                  color: DairyColors.textPrimary,
                  backgroundColor: DairyColors.surface,
                }}
                placeholder={x("Lactometer", "लैक्टोमीटर")}
                placeholderTextColor="#99A99A"
                keyboardType="decimal-pad"
                value={selectedDraft.lactometer}
                onChangeText={(v) => setDraft(selectedAnimal.animalId, { lactometer: v })}
              />
            </View>

            <TextInput
              editable={canEditQc}
              style={{
                marginTop: 8,
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 10,
                padding: 9,
                color: DairyColors.textPrimary,
                backgroundColor: DairyColors.surface,
              }}
              placeholder={x("Smell/Notes", "गंध/नोट्स")}
              placeholderTextColor="#99A99A"
              value={selectedDraft.smellNotes}
              onChangeText={(v) => setDraft(selectedAnimal.animalId, { smellNotes: v })}
            />
            {selectedDraft.qcStatus === "REJECT" ? (
              <TextInput
                editable={canEditQc}
                style={{
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: DairyColors.danger,
                  borderRadius: 10,
                  padding: 9,
                  color: DairyColors.textPrimary,
                  backgroundColor: DairyColors.surface,
                }}
                placeholder={x("Rejection reason", "रिजेक्ट कारण")}
                placeholderTextColor="#99A99A"
                value={selectedDraft.rejectionReason}
                onChangeText={(v) => setDraft(selectedAnimal.animalId, { rejectionReason: v })}
              />
            ) : null}
          </View>
        ) : (
          <Text style={{ marginTop: 10, color: DairyColors.textSecondary }}>
            {x("No cows available for QC.", "QC के लिए कोई गाय उपलब्ध नहीं है।")}
          </Text>
        )}

        {canApproveBatch ? (
          <Pressable
            disabled={!batch || savingStep1 || !allCowsReviewed || batchLocked}
            onPress={saveStep1}
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 10,
              backgroundColor:
                !batch || !allCowsReviewed || savingStep1 || batchLocked
                  ? DairyColors.textSecondary
                  : DairyColors.primary,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "white", fontWeight: "800" }}>
              {savingStep1
                ? x("Saving Step 1...", "स्टेप 1 सेव हो रहा है...")
                : batchLocked
                  ? x("Locked After PASS", "PASS के बाद लॉक")
                  : x("Save Step 1", "स्टेप 1 सेव करें")}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View
        style={{
          marginTop: 14,
          backgroundColor: DairyColors.surface,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: DairyColors.border,
          padding: 12,
        }}
      >
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
          {x("Step 2: Overall Batch QC", "स्टेप 2: ओवरऑल बैच QC")}
        </Text>
        <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
          {anyCowReviewed
            ? x(
                `Suggested overall: ${recommendedOverall}. Reviewed ${reviewedCount}/${animals.length}. ${step1Saved ? "Step 1 saved." : "Save Step 1 first."}`,
                `सुझाव: ${recommendedOverall === "PASS" ? "पास" : recommendedOverall === "HOLD" ? "होल्ड" : "रिजेक्ट"}। जांच ${reviewedCount}/${animals.length}। ${step1Saved ? "स्टेप 1 सेव है।" : "पहले स्टेप 1 सेव करें।"}`
              )
            : x("Complete Step 1 for at least one cow first.", "पहले कम से कम एक गाय का स्टेप 1 पूरा करें।")}
        </Text>

        {canApproveBatch ? (
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            {(["PASS", "HOLD", "REJECT"] as QcStatus[]).map((s) => {
              const tone = statusTone(s);
              const disabled = !batch || updating !== "" || !anyCowReviewed || !step1Saved || batchLocked;
              return (
                <Pressable
                  key={s}
                  disabled={disabled}
                  onPress={() => updateStatus(s)}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 10,
                    backgroundColor: tone.text,
                    opacity: disabled ? 0.45 : 1,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "800" }}>
                    {updating === s ? "..." : label("qcStatus", s)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {!batch && !loading ? (
        <View
          style={{
            marginTop: 12,
            borderRadius: 10,
            backgroundColor: DairyColors.warningSoft,
            padding: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Ionicons name="warning" size={16} color={DairyColors.warning} />
          <Text style={{ color: DairyColors.warning }}>
            {x(
              `No milk batch found. Save ${shift} batch first in Milk tab.`,
              `दूध बैच नहीं मिला। पहले Milk टैब में ${shift === "AM" ? "सुबह" : "शाम"} बैच सेव करें।`
            )}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
