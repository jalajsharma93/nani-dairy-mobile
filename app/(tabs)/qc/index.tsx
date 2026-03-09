import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  AnimalApi,
  AnimalResponse,
  MilkApi,
  MilkBatchResponse,
  MilkBatchQcEvaluationResponse,
  MilkEntryApi,
  QcStatus,
  Shift,
} from "@/src/services/api";
import { DairyColors } from "@/src/constants/dairy-theme";
import { todayLocalISO } from "@/src/utils/date";
import {
  getPendingSyncSummary,
  PendingSyncSummary,
  queueQcBatchStatusUpdate,
  queueQcCowUpdate,
  shouldQueueForOffline,
} from "@/src/utils/offline-sync";
import { useAuth } from "@/src/state/auth";
import { useI18n } from "@/src/state/i18n";

type CowQcStatus = Exclude<QcStatus, "PENDING">;
type CowQcDraft = {
  qcStatus?: CowQcStatus;
  fat: string;
  snf: string;
  temperature: string;
  lactometer: string;
  smellNotes: string;
  rejectionReason: string;
  colorObservation: string;
  acidity: string;
  waterAdulteration: "YES" | "NO" | "";
  antibioticResidue: "YES" | "NO" | "";
  bacterialCount: string;
  labTestAttachmentUrl: string;
};

const EMPTY_DRAFT: CowQcDraft = {
  fat: "",
  snf: "",
  temperature: "",
  lactometer: "",
  smellNotes: "",
  rejectionReason: "",
  colorObservation: "",
  acidity: "",
  waterAdulteration: "",
  antibioticResidue: "",
  bacterialCount: "",
  labTestAttachmentUrl: "",
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

function qcSeverity(status?: QcStatus | null) {
  if (status === "REJECT") return 2;
  if (status === "HOLD") return 1;
  if (status === "PASS") return 0;
  return -1;
}

function parseOptionalNumber(value: string, labelName: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${labelName} must be a valid non-negative number`);
  }
  return parsed;
}

export default function QualityCheckScreen() {
  const { hasAnyRole } = useAuth();
  const { x, label } = useI18n();
  const isAdmin = hasAnyRole("ADMIN");
  const canApproveBatch = hasAnyRole("ADMIN", "MANAGER");

  const [date] = useState<string>(todayLocalISO());
  const [shift, setShift] = useState<Shift>("AM");

  const [batch, setBatch] = useState<MilkBatchResponse | null>(null);
  const [evaluation, setEvaluation] = useState<MilkBatchQcEvaluationResponse | null>(null);
  const [animals, setAnimals] = useState<AnimalResponse[]>([]);
  const [selectedAnimalId, setSelectedAnimalId] = useState<string>("");
  const [showAnimalPicker, setShowAnimalPicker] = useState(false);

  const [draftsByBatch, setDraftsByBatch] = useState<Record<string, Record<string, CowQcDraft>>>({});
  const [step1SavedByBatch, setStep1SavedByBatch] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [savingStep1, setSavingStep1] = useState(false);
  const [updating, setUpdating] = useState<QcStatus | "">("");
  const [overrideRecommendedStatus, setOverrideRecommendedStatus] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
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

  const batchKey = `${date}__${shift}`;
  const drafts = draftsByBatch[batchKey] ?? EMPTY_DRAFTS;

  const selectedAnimal = animals.find((a) => a.animalId === selectedAnimalId) ?? null;
  const selectedDraft = selectedAnimal ? drafts[selectedAnimal.animalId] ?? EMPTY_DRAFT : EMPTY_DRAFT;

  const batchLocked = batch?.qcStatus === "PASS";
  const canEditQc = canApproveBatch && !batchLocked;
  const qcPendingCount = pendingSync.qcCowUpdate + pendingSync.qcBatchStatusUpdate;

  const refreshPendingSync = useCallback(async () => {
    setPendingSync(await getPendingSyncSummary());
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [batchRes, evalRes, animalsRes, entryRes] = await Promise.all([
        MilkApi.getBatch(date, shift),
        MilkApi.getQcEvaluation(date, shift).catch(() => null),
        AnimalApi.list({ active: true, status: "LACTATING" }),
        MilkEntryApi.list(date, shift),
      ]);

      setBatch(batchRes);
      setEvaluation(evalRes);
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
          colorObservation: entry.colorObservation ?? "",
          acidity: entry.acidity == null ? "" : String(entry.acidity),
          waterAdulteration:
            entry.waterAdulteration == null ? "" : entry.waterAdulteration ? "YES" : "NO",
          antibioticResidue:
            entry.antibioticResidue == null ? "" : entry.antibioticResidue ? "YES" : "NO",
          bacterialCount: entry.bacterialCount == null ? "" : String(entry.bacterialCount),
          labTestAttachmentUrl: entry.labTestAttachmentUrl ?? "",
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

  useEffect(() => {
    setOverrideRecommendedStatus(false);
    setOverrideReason("");
  }, [date, shift]);

  useEffect(() => {
    if (!isAdmin && overrideRecommendedStatus) {
      setOverrideRecommendedStatus(false);
      setOverrideReason("");
    }
  }, [isAdmin, overrideRecommendedStatus]);

  useEffect(() => {
    void refreshPendingSync();
  }, [refreshPendingSync]);

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

  const buildStep1Entries = useCallback(() => {
    return animals.flatMap((animal) => {
      const d = drafts[animal.animalId] ?? EMPTY_DRAFT;
      const hasMetrics =
        !!d.fat.trim() ||
        !!d.snf.trim() ||
        !!d.temperature.trim() ||
        !!d.lactometer.trim() ||
        !!d.smellNotes.trim() ||
        !!d.rejectionReason.trim() ||
        !!d.colorObservation.trim() ||
        !!d.acidity.trim() ||
        !!d.bacterialCount.trim() ||
        !!d.labTestAttachmentUrl.trim() ||
        d.waterAdulteration !== "" ||
        d.antibioticResidue !== "";
      const effectiveStatus = d.qcStatus ?? (hasMetrics ? "HOLD" : undefined);
      if (!effectiveStatus) {
        return [];
      }
      const rejectionReason = d.rejectionReason.trim();
      if (effectiveStatus === "REJECT" && !rejectionReason) {
        throw new Error(`Rejection reason is required for ${animal.tag}`);
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
          rejectionReason: rejectionReason || null,
          colorObservation: d.colorObservation.trim() || null,
          acidity: parseOptionalNumber(d.acidity, "Acidity"),
          waterAdulteration:
            d.waterAdulteration === "" ? null : d.waterAdulteration === "YES",
          antibioticResidue:
            d.antibioticResidue === "" ? null : d.antibioticResidue === "YES",
          bacterialCount: parseOptionalNumber(d.bacterialCount, "Bacterial Count"),
          labTestAttachmentUrl: d.labTestAttachmentUrl.trim() || null,
        },
      ];
    });
  }, [animals, drafts]);

  const recommendedOverall: CowQcStatus | null = useMemo(() => {
    if (!anyCowReviewed) return null;
    const statuses = animals
      .map((a) => drafts[a.animalId]?.qcStatus)
      .filter(Boolean) as CowQcStatus[];
    if (statuses.includes("REJECT")) return "REJECT";
    if (statuses.includes("HOLD")) return "HOLD";
    return "PASS";
  }, [anyCowReviewed, animals, drafts]);

  const recommendedByRules: QcStatus | null = evaluation?.recommendedQcStatus ?? recommendedOverall;

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

    let entries: {
      animalId: string;
      qcStatus: QcStatus;
      fat?: number | null;
      snf?: number | null;
      temperature?: number | null;
      lactometer?: number | null;
      smellNotes?: string | null;
      rejectionReason?: string | null;
    }[] = [];
    try {
      entries = buildStep1Entries();
    } catch (error: any) {
      const message = String(error?.message ?? "");
      if (message.toLowerCase().includes("non-negative number")) {
        Alert.alert(
          x("Invalid values", "गलत मान"),
          x("Fat/SNF/temperature/lactometer must be valid non-negative numbers.", "फैट/SNF/तापमान/लैक्टोमीटर सही non-negative संख्या हों।")
        );
      } else if (message.toLowerCase().includes("rejection reason is required")) {
        Alert.alert(
          x("Reason required", "कारण जरूरी"),
          x("Each REJECT cow must include rejection reason.", "हर REJECT गाय के लिए कारण भरना जरूरी है।")
        );
      } else {
        Alert.alert(x("Validation failed", "वैलिडेशन असफल"), message);
      }
      return;
    }

    if (entries.length === 0) {
      Alert.alert(
        x("Nothing to save", "सेव करने के लिए कुछ नहीं"),
        x("Set status or QC details for at least one cow.", "कम से कम एक गाय का स्टेटस या QC विवरण भरें।")
      );
      return;
    }

    try {
      setSavingStep1(true);
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
      if (message.toLowerCase().includes("rejection reason is required")) {
        Alert.alert(
          x("Reason required", "कारण जरूरी"),
          x("Each REJECT cow must include rejection reason.", "हर REJECT गाय के लिए कारण भरना जरूरी है।")
        );
        return;
      }
      if (message.toLowerCase().includes("locked after qc pass")) {
        Alert.alert(
          x("Locked", "लॉक है"),
          x("Batch is PASS. Step 1 QC cannot be edited.", "बैच PASS है। स्टेप 1 QC बदला नहीं जा सकता।")
        );
        await loadData();
      } else if (shouldQueueForOffline(e)) {
        if (entries.length > 0) {
          await queueQcCowUpdate({ date, shift, entries }, message);
          await refreshPendingSync();
          setStep1SavedByBatch((prev) => ({ ...prev, [batchKey]: true }));
          Alert.alert(
            x("Saved Offline", "ऑफलाइन सेव"),
            x(
              "Per-cow QC is queued and will sync automatically.",
              "प्रति गाय QC कतार में है और अपने-आप सिंक होगा।"
            )
          );
          return;
        }
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

    const recommended = evaluation?.recommendedQcStatus ?? null;
    const overrideNeeded = recommended != null && qcSeverity(status) < qcSeverity(recommended);
    const trimmedOverrideReason = overrideReason.trim();
    if (overrideRecommendedStatus) {
      if (!isAdmin) {
        Alert.alert(
          x("Supervisor approval required", "सुपरवाइज़र मंजूरी जरूरी"),
          x("Only ADMIN can approve QC override.", "QC ओवरराइड सिर्फ ADMIN मंजूर कर सकता है।")
        );
        return;
      }
      if (!trimmedOverrideReason) {
        Alert.alert(
          x("Override reason required", "ओवरराइड कारण जरूरी"),
          x("Add override reason before forcing QC status.", "QC स्टेटस force करने से पहले कारण लिखें।")
        );
        return;
      }
    }

    try {
      setUpdating(status);
      const payload = {
        date,
        shift,
        qcStatus: status,
        overrideRecommendedStatus: overrideRecommendedStatus ? true : undefined,
        overrideReason: overrideRecommendedStatus ? trimmedOverrideReason : undefined,
      };
      const res = await MilkApi.updateQc(payload);
      setBatch(res);
      const nextEval = await MilkApi.getQcEvaluation(date, shift).catch(() => null);
      setEvaluation(nextEval);

      if (res.qcStatus !== status && overrideNeeded && !overrideRecommendedStatus) {
        Alert.alert(
          x("Rule applied", "रूल लागू हुआ"),
          x(
            `Requested ${status}, but rule engine set ${res.qcStatus}. Use ADMIN override with reason to force.`,
            `आपने ${status} चुना, लेकिन रूल इंजन ने ${res.qcStatus} सेट किया। force करने के लिए ADMIN ओवरराइड कारण के साथ उपयोग करें।`
          )
        );
      } else {
        Alert.alert(
          x("Updated", "अपडेट हुआ"),
          x(`Overall QC set to ${res.qcStatus}`, `ओवरऑल QC ${res.qcStatus} किया गया`)
        );
      }
      setOverrideRecommendedStatus(false);
      setOverrideReason("");
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
      if (message.toLowerCase().includes("only admin can approve qc override")) {
        Alert.alert(
          x("Supervisor approval required", "सुपरवाइज़र मंजूरी जरूरी"),
          x("Only ADMIN can approve QC override.", "QC ओवरराइड सिर्फ ADMIN मंजूर कर सकता है।")
        );
        return;
      }
      if (message.toLowerCase().includes("overridereason is required")) {
        Alert.alert(
          x("Override reason required", "ओवरराइड कारण जरूरी"),
          x("Add override reason before forcing QC status.", "QC स्टेटस force करने से पहले कारण लिखें।")
        );
        return;
      }
      if (message.toLowerCase().includes("locked after qc pass")) {
        Alert.alert(
          x("Locked", "लॉक है"),
          x("Batch is PASS. Overall QC cannot be changed.", "बैच PASS है। ओवरऑल QC नहीं बदला जा सकता।")
        );
        await loadData();
      } else if (shouldQueueForOffline(e)) {
        await queueQcBatchStatusUpdate(
          {
            date,
            shift,
            qcStatus: status,
            overrideRecommendedStatus: overrideRecommendedStatus ? true : undefined,
            overrideReason: overrideRecommendedStatus ? trimmedOverrideReason : undefined,
          },
          message
        );
        await refreshPendingSync();
        setBatch((prev) =>
          prev
            ? {
                ...prev,
                qcStatus: status,
              }
            : prev
        );
        Alert.alert(
          x("Saved Offline", "ऑफलाइन सेव"),
          x("Overall QC status is queued and will sync automatically.", "ओवरऑल QC स्टेटस कतार में है और अपने-आप सिंक होगा।")
        );
        return;
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
          marginTop: 10,
          borderWidth: 1,
          borderColor: DairyColors.border,
          borderRadius: 10,
          backgroundColor: qcPendingCount > 0 ? DairyColors.warningSoft : DairyColors.successSoft,
          padding: 10,
        }}
      >
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
          {qcPendingCount > 0 ? x("QC Sync Pending", "QC सिंक बाकी") : x("QC Synced", "QC सिंक")}
        </Text>
        <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
          {x(
            `Cow updates ${pendingSync.qcCowUpdate} | Batch updates ${pendingSync.qcBatchStatusUpdate} | Dead letter ${pendingSync.deadLetter}`,
            `गाय अपडेट ${pendingSync.qcCowUpdate} | बैच अपडेट ${pendingSync.qcBatchStatusUpdate} | डेड लेटर ${pendingSync.deadLetter}`
          )}
        </Text>
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
            <View style={{ marginTop: 8 }}>
              <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
                {x("Color Observation", "रंग जांच")}
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                {[
                  { key: "NORMAL", labelEn: "Normal", labelHi: "सामान्य" },
                  { key: "ABNORMAL", labelEn: "Abnormal", labelHi: "असामान्य" },
                ].map((option) => {
                  const selected = selectedDraft.colorObservation === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      disabled={!canEditQc}
                      onPress={() =>
                        setDraft(selectedAnimal.animalId, {
                          colorObservation: selected ? "" : option.key,
                        })
                      }
                      style={{
                        borderWidth: 1,
                        borderColor: selected ? DairyColors.primary : DairyColors.border,
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        backgroundColor: selected ? DairyColors.primarySoft : DairyColors.surface,
                        opacity: canEditQc ? 1 : 0.6,
                      }}
                    >
                      <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                        {x(option.labelEn, option.labelHi)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
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
                placeholder={x("Acidity", "अम्लता")}
                placeholderTextColor="#99A99A"
                keyboardType="decimal-pad"
                value={selectedDraft.acidity}
                onChangeText={(v) => setDraft(selectedAnimal.animalId, { acidity: v })}
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
                placeholder={x("Bacterial Count", "बैक्टीरियल काउंट")}
                placeholderTextColor="#99A99A"
                keyboardType="decimal-pad"
                value={selectedDraft.bacterialCount}
                onChangeText={(v) => setDraft(selectedAnimal.animalId, { bacterialCount: v })}
              />
            </View>

            <View style={{ marginTop: 8 }}>
              <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
                {x("Water Adulteration", "पानी मिलावट")}
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                {[
                  { key: "YES" as const, labelEn: "Detected", labelHi: "मिली" },
                  { key: "NO" as const, labelEn: "Not Detected", labelHi: "नहीं मिली" },
                ].map((option) => {
                  const selected = selectedDraft.waterAdulteration === option.key;
                  return (
                    <Pressable
                      key={`water-${option.key}`}
                      disabled={!canEditQc}
                      onPress={() =>
                        setDraft(selectedAnimal.animalId, {
                          waterAdulteration: selected ? "" : option.key,
                        })
                      }
                      style={{
                        borderWidth: 1,
                        borderColor: selected ? DairyColors.primary : DairyColors.border,
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        backgroundColor: selected ? DairyColors.primarySoft : DairyColors.surface,
                        opacity: canEditQc ? 1 : 0.6,
                      }}
                    >
                      <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                        {x(option.labelEn, option.labelHi)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={{ marginTop: 8 }}>
              <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
                {x("Antibiotic Residue", "एंटीबायोटिक अवशेष")}
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                {[
                  { key: "YES" as const, labelEn: "Detected", labelHi: "मिला" },
                  { key: "NO" as const, labelEn: "Not Detected", labelHi: "नहीं मिला" },
                ].map((option) => {
                  const selected = selectedDraft.antibioticResidue === option.key;
                  return (
                    <Pressable
                      key={`abx-${option.key}`}
                      disabled={!canEditQc}
                      onPress={() =>
                        setDraft(selectedAnimal.animalId, {
                          antibioticResidue: selected ? "" : option.key,
                        })
                      }
                      style={{
                        borderWidth: 1,
                        borderColor: selected ? DairyColors.primary : DairyColors.border,
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        backgroundColor: selected ? DairyColors.primarySoft : DairyColors.surface,
                        opacity: canEditQc ? 1 : 0.6,
                      }}
                    >
                      <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                        {x(option.labelEn, option.labelHi)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
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
              placeholder={x("Lab Report URL (optional)", "लैब रिपोर्ट URL (वैकल्पिक)")}
              placeholderTextColor="#99A99A"
              value={selectedDraft.labTestAttachmentUrl}
              onChangeText={(v) => setDraft(selectedAnimal.animalId, { labTestAttachmentUrl: v })}
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
            disabled={!batch || savingStep1 || !anyCowReviewed || batchLocked}
            onPress={saveStep1}
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 10,
              backgroundColor:
                !batch || !anyCowReviewed || savingStep1 || batchLocked
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
                `Suggested overall: ${recommendedByRules ?? "PENDING"}. Reviewed ${reviewedCount}/${animals.length}. ${step1Saved ? "Step 1 saved." : "Save Step 1 first."}`,
                `सुझाव: ${
                  recommendedByRules === "PASS"
                    ? "पास"
                    : recommendedByRules === "HOLD"
                      ? "होल्ड"
                      : recommendedByRules === "REJECT"
                        ? "रिजेक्ट"
                        : "पेंडिंग"
                }। जांच ${reviewedCount}/${animals.length}। ${step1Saved ? "स्टेप 1 सेव है।" : "पहले स्टेप 1 सेव करें।"}`
              )
            : x("Complete Step 1 for at least one cow first.", "पहले कम से कम एक गाय का स्टेप 1 पूरा करें।")}
        </Text>

        {evaluation ? (
          <View
            style={{
              marginTop: 8,
              borderWidth: 1,
              borderColor: DairyColors.border,
              borderRadius: 10,
              backgroundColor: DairyColors.surfaceMuted,
              padding: 10,
            }}
          >
            <Text style={{ color: DairyColors.textSecondary }}>
              {x(
                `Rule review: reviewed ${evaluation.reviewedEntries}, pass ${evaluation.passEntries}, hold ${evaluation.holdEntries}, reject ${evaluation.rejectEntries}`,
                `रूल समीक्षा: जांच ${evaluation.reviewedEntries}, पास ${evaluation.passEntries}, होल्ड ${evaluation.holdEntries}, रिजेक्ट ${evaluation.rejectEntries}`
              )}
            </Text>
            <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
              {x(
                `Triggers: ${evaluation.triggerCodes.length > 0 ? evaluation.triggerCodes.join(", ") : "None"}`,
                `ट्रिगर: ${evaluation.triggerCodes.length > 0 ? evaluation.triggerCodes.join(", ") : "कोई नहीं"}`
              )}
            </Text>
          </View>
        ) : null}

        {isAdmin ? (
          <View
            style={{
              marginTop: 10,
              borderWidth: 1,
              borderColor: DairyColors.border,
              borderRadius: 10,
              backgroundColor: DairyColors.surfaceMuted,
              padding: 10,
            }}
          >
            <Pressable
              disabled={batchLocked}
              onPress={() => setOverrideRecommendedStatus((prev) => !prev)}
              style={{
                borderWidth: 1,
                borderColor: overrideRecommendedStatus ? DairyColors.warning : DairyColors.border,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
                alignSelf: "flex-start",
                backgroundColor: overrideRecommendedStatus ? DairyColors.warningSoft : DairyColors.surface,
                opacity: batchLocked ? 0.5 : 1,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                {overrideRecommendedStatus
                  ? x("Override Enabled", "ओवरराइड चालू")
                  : x("Enable Override", "ओवरराइड चालू करें")}
              </Text>
            </Pressable>
            <TextInput
              value={overrideReason}
              onChangeText={setOverrideReason}
              editable={overrideRecommendedStatus}
              placeholder={x("Override reason (required when forcing status)", "ओवरराइड कारण (force के लिए जरूरी)")}
              placeholderTextColor="#99A99A"
              style={{
                marginTop: 8,
                borderWidth: 1,
                borderColor: overrideRecommendedStatus ? DairyColors.warning : DairyColors.border,
                borderRadius: 10,
                padding: 9,
                color: DairyColors.textPrimary,
                backgroundColor: DairyColors.surface,
                opacity: overrideRecommendedStatus ? 1 : 0.7,
              }}
            />
          </View>
        ) : null}

        {canApproveBatch ? (
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            {(["PASS", "HOLD", "REJECT"] as QcStatus[]).map((s) => {
              const tone = statusTone(s);
              const disabled =
                !batch ||
                updating !== "" ||
                !anyCowReviewed ||
                !step1Saved ||
                batchLocked ||
                (overrideRecommendedStatus && !isAdmin) ||
                (overrideRecommendedStatus && !overrideReason.trim());
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
