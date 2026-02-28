import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  API_BASE_URL,
  AnimalApi,
  AnimalResponse,
  CreateMedicalTreatmentPayload,
  MedicalTreatmentResponse,
  TreatmentApi,
  UploadApi,
} from "../../services/api";
import { DairyColors } from "../../constants/dairy-theme";
import { useAuth } from "../../state/auth";
import { shiftIsoDate, todayLocalISO } from "../../utils/date";
import { useI18n } from "../../state/i18n";
import {
  getPendingSyncSummary,
  PendingSyncSummary,
  queueTreatmentSave,
  shouldQueueForOffline,
} from "../../utils/offline-sync";

type DueFilter = "ALL" | "DUE_TODAY" | "DUE_SOON" | "OVERDUE";

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addDaysIso(baseIsoDate: string, days: number) {
  if (!isIsoDate(baseIsoDate)) {
    return null;
  }
  const date = new Date(`${baseIsoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  date.setDate(date.getDate() + days);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function suggestedFollowUpDays(diagnosis: string) {
  const normalized = diagnosis.trim().toLowerCase();
  if (!normalized) {
    return 7;
  }
  if (normalized.includes("mastitis") || normalized.includes("fever")) {
    return 3;
  }
  if (normalized.includes("wound") || normalized.includes("injury")) {
    return 5;
  }
  return 7;
}

function guessMimeType(uri: string) {
  const normalized = uri.trim().toLowerCase();
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

function classifyDue(nextDueDate: string | null | undefined, baseDate: string, windowDays = 7) {
  if (!nextDueDate) {
    return "NO_DUE" as const;
  }
  if (nextDueDate < baseDate) {
    return "OVERDUE" as const;
  }
  if (nextDueDate === baseDate) {
    return "DUE_TODAY" as const;
  }
  const dueSoonLastDay = shiftIsoDate(baseDate, windowDays);
  if (nextDueDate <= dueSoonLastDay) {
    return "DUE_SOON" as const;
  }
  return "NO_DUE" as const;
}

function dueTone(status: "NO_DUE" | "DUE_TODAY" | "DUE_SOON" | "OVERDUE") {
  if (status === "OVERDUE") {
    return { text: DairyColors.danger, background: DairyColors.dangerSoft, label: "OVERDUE" };
  }
  if (status === "DUE_TODAY") {
    return { text: DairyColors.warning, background: DairyColors.warningSoft, label: "DUE TODAY" };
  }
  if (status === "DUE_SOON") {
    return { text: DairyColors.info, background: DairyColors.infoSoft, label: "DUE SOON" };
  }
  return { text: DairyColors.success, background: DairyColors.successSoft, label: "OK" };
}

const FILTERS: DueFilter[] = ["ALL", "DUE_TODAY", "DUE_SOON", "OVERDUE"];

function animalDisplayLabel(animal: AnimalResponse) {
  return animal.tag?.trim() || animal.name?.trim() || animal.animalId;
}

export default function TreatmentsScreen() {
  const params = useLocalSearchParams<{ animalId?: string; tag?: string }>();
  const router = useRouter();
  const { hasAnyRole } = useAuth();
  const { x } = useI18n();
  const canManageTreatments = hasAnyRole("ADMIN", "MANAGER", "VET");

  const [date] = useState(todayLocalISO());
  const [animals, setAnimals] = useState<AnimalResponse[]>([]);
  const [selectedAnimalId, setSelectedAnimalId] = useState("");
  const [animalLookup, setAnimalLookup] = useState("");
  const [treatments, setTreatments] = useState<MedicalTreatmentResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dueFilter, setDueFilter] = useState<DueFilter>("ALL");
  const [editingTreatmentId, setEditingTreatmentId] = useState<string | null>(null);
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

  const [treatmentDate, setTreatmentDate] = useState(todayLocalISO());
  const [diagnosis, setDiagnosis] = useState("");
  const [medicineName, setMedicineName] = useState("");
  const [dose, setDose] = useState("");
  const [route, setRoute] = useState("");
  const [veterinarianName, setVeterinarianName] = useState("");
  const [prescriptionPhotoUrl, setPrescriptionPhotoUrl] = useState("");
  const [prescriptionUploadUri, setPrescriptionUploadUri] = useState("");
  const [withdrawalTillDate, setWithdrawalTillDate] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [autoFollowUpHintDays, setAutoFollowUpHintDays] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [uploadingPrescription, setUploadingPrescription] = useState(false);

  const selectedAnimal = useMemo(
    () => animals.find((a) => a.animalId === selectedAnimalId) ?? null,
    [animals, selectedAnimalId]
  );

  const activeWithdrawalRows = useMemo(
    () =>
      treatments.filter((row) => {
        if (!row.withdrawalTillDate) {
          return false;
        }
        return row.withdrawalTillDate >= date;
      }),
    [date, treatments]
  );

  const resetForm = () => {
    setEditingTreatmentId(null);
    setTreatmentDate(todayLocalISO());
    setDiagnosis("");
    setMedicineName("");
    setDose("");
    setRoute("");
    setVeterinarianName("");
    setPrescriptionPhotoUrl("");
    setPrescriptionUploadUri("");
    setWithdrawalTillDate("");
    setFollowUpDate("");
    setAutoFollowUpHintDays(null);
    setNotes("");
  };

  const applyFollowUpSuggestion = (days?: number) => {
    const resolvedDays = days ?? suggestedFollowUpDays(diagnosis);
    const next = addDaysIso(treatmentDate.trim(), resolvedDays);
    if (!next) {
      Alert.alert(
        x("Invalid date", "गलत तारीख"),
        x("Set treatment date in YYYY-MM-DD format first.", "पहले ट्रीटमेंट तारीख YYYY-MM-DD में भरें।")
      );
      return;
    }
    setFollowUpDate(next);
    setAutoFollowUpHintDays(resolvedDays);
  };

  const uploadPrescriptionFromUri = async () => {
    const uri = prescriptionUploadUri.trim();
    if (!uri) {
      Alert.alert(
        x("Missing URI", "URI नहीं मिला"),
        x("Enter file URI/path first.", "पहले file URI/path दर्ज करें।")
      );
      return;
    }

    const fileName = uri.split("/").filter(Boolean).pop() || `prescription-${Date.now()}.jpg`;
    const contentType = guessMimeType(uri);

    try {
      setUploadingPrescription(true);
      const uploaded = await UploadApi.uploadPrescription({
        uri,
        name: fileName,
        type: contentType,
      });
      const absoluteUrl = uploaded.url.startsWith("http")
        ? uploaded.url
        : `${API_BASE_URL}${uploaded.url.startsWith("/") ? "" : "/"}${uploaded.url}`;
      setPrescriptionPhotoUrl(absoluteUrl);
      Alert.alert(
        x("Upload complete", "अपलोड पूरा"),
        x("Prescription uploaded and linked to form.", "प्रिस्क्रिप्शन अपलोड होकर फॉर्म से जुड़ गया।")
      );
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Upload failed", "अपलोड असफल"),
        String(e?.message ?? x("Could not upload prescription.", "प्रिस्क्रिप्शन अपलोड नहीं हो पाया।"))
      );
    } finally {
      setUploadingPrescription(false);
    }
  };

  const loadTreatments = useCallback(async (animalId: string) => {
    if (!animalId) {
      setTreatments([]);
      return;
    }
    setTreatments(await TreatmentApi.list(animalId));
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const animalRows = await AnimalApi.list({ active: true });
      setAnimals(animalRows);

      const requestedAnimalId = (params.animalId ?? "").trim().toLowerCase();
      const requestedTag = (params.tag ?? "").trim().toLowerCase();
      const selectedFromParams =
        animalRows.find((a) => a.animalId.toLowerCase() === requestedAnimalId)?.animalId ??
        animalRows.find((a) => a.tag.toLowerCase() === requestedTag)?.animalId;

      const nextAnimalId =
        animalRows.find((a) => a.animalId === selectedAnimalId)?.animalId ??
        selectedFromParams ??
        animalRows[0]?.animalId ??
        "";

      setSelectedAnimalId(nextAnimalId);
      await loadTreatments(nextAnimalId);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load treatments.", "ट्रीटमेंट डेटा लोड नहीं हो पाया।")
      );
    } finally {
      setLoading(false);
    }
  }, [loadTreatments, params.animalId, params.tag, selectedAnimalId, x]);

  const refreshPendingSync = useCallback(async () => {
    setPendingSync(await getPendingSyncSummary());
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    void refreshPendingSync();
  }, [refreshPendingSync]);

  useEffect(() => {
    const fromParam = (params.tag ?? params.animalId ?? "").trim();
    if (fromParam && !animalLookup.trim()) {
      setAnimalLookup(fromParam);
    }
  }, [animalLookup, params.animalId, params.tag]);

  const onSelectAnimal = async (animalId: string) => {
    setSelectedAnimalId(animalId);
    resetForm();
    try {
      setLoading(true);
      await loadTreatments(animalId);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load treatment records.", "ट्रीटमेंट रिकॉर्ड लोड नहीं हो पाए।")
      );
    } finally {
      setLoading(false);
    }
  };

  const onLookupAnimal = async () => {
    const needle = animalLookup.trim().toLowerCase();
    if (!needle) {
      Alert.alert(
        x("Missing details", "जानकारी अधूरी"),
        x("Enter tag. Animal ID also works.", "टैग दर्ज करें। Animal ID भी चलेगा।")
      );
      return;
    }

    const exactMatch = animals.find(
      (a) => a.animalId.toLowerCase() === needle || a.tag.toLowerCase() === needle
    );
    const partialMatch =
      exactMatch ??
      animals.find(
        (a) => a.animalId.toLowerCase().includes(needle) || a.tag.toLowerCase().includes(needle)
      );

    if (!partialMatch) {
      Alert.alert(
        x("Not found", "नहीं मिला"),
        x("No active animal found with this value.", "इस मान से कोई सक्रिय जानवर नहीं मिला।")
      );
      return;
    }

    await onSelectAnimal(partialMatch.animalId);
  };

  const saveTreatment = async () => {
    if (!selectedAnimalId) {
      Alert.alert(x("Select animal", "जानवर चुनें"), x("Please select an animal first.", "पहले जानवर चुनें।"));
      return;
    }
    if (!canManageTreatments) {
      Alert.alert(
        x("Role restricted", "रोल अनुमति नहीं"),
        x(
          "Only ADMIN, MANAGER or VET users can log treatments.",
          "ट्रीटमेंट रिकॉर्ड सिर्फ ADMIN, MANAGER या VET जोड़ सकते हैं।"
        )
      );
      return;
    }

    if (!isIsoDate(treatmentDate.trim())) {
      Alert.alert(
        x("Invalid date", "गलत तारीख"),
        x("Treatment date must be in YYYY-MM-DD format.", "ट्रीटमेंट तारीख YYYY-MM-DD फॉर्मेट में होनी चाहिए।")
      );
      return;
    }

    if (!diagnosis.trim() || !medicineName.trim()) {
      Alert.alert(
        x("Missing details", "जानकारी अधूरी"),
        x("Diagnosis and medicine name are required.", "डायग्नोसिस और दवा नाम जरूरी है।")
      );
      return;
    }

    const optionalDates = [followUpDate.trim(), withdrawalTillDate.trim()].filter(Boolean);
    if (optionalDates.some((d) => !isIsoDate(d))) {
      Alert.alert(
        x("Invalid date", "गलत तारीख"),
        x("Use YYYY-MM-DD format for optional dates.", "वैकल्पिक तारीखों के लिए भी YYYY-MM-DD फॉर्मेट रखें।")
      );
      return;
    }

    if (followUpDate.trim() && followUpDate.trim() < treatmentDate.trim()) {
      Alert.alert(
        x("Invalid dates", "गलत तारीखें"),
        x("Follow-up date cannot be before treatment date.", "फॉलो-अप तारीख ट्रीटमेंट तारीख से पहले नहीं हो सकती।")
      );
      return;
    }

    if (withdrawalTillDate.trim() && withdrawalTillDate.trim() < treatmentDate.trim()) {
      Alert.alert(
        x("Invalid dates", "गलत तारीखें"),
        x("Withdrawal end date cannot be before treatment date.", "विथड्रॉल समाप्ति तारीख ट्रीटमेंट तारीख से पहले नहीं हो सकती।")
      );
      return;
    }

    const photoUrl = prescriptionPhotoUrl.trim();
    if (photoUrl && !/^https?:\/\/\S+$/i.test(photoUrl)) {
      Alert.alert(
        x("Invalid URL", "गलत URL"),
        x("Prescription photo URL must start with http:// or https://", "प्रिस्क्रिप्शन फोटो URL http:// या https:// से शुरू होना चाहिए।")
      );
      return;
    }

    const payload: CreateMedicalTreatmentPayload = {
      treatmentDate: treatmentDate.trim(),
      diagnosis: diagnosis.trim(),
      medicineName: medicineName.trim(),
      dose: dose.trim() || null,
      route: route.trim() || null,
      veterinarianName: veterinarianName.trim() || null,
      prescriptionPhotoUrl: photoUrl || null,
      withdrawalTillDate: withdrawalTillDate.trim() || null,
      followUpDate: followUpDate.trim() || null,
      notes: notes.trim() || null,
    };

    try {
      setSaving(true);
      if (editingTreatmentId) {
        await TreatmentApi.update(selectedAnimalId, editingTreatmentId, payload);
      } else {
        await TreatmentApi.create(selectedAnimalId, payload);
      }
      await loadTreatments(selectedAnimalId);
      resetForm();
      Alert.alert(
        x("Saved", "सेव हो गया"),
        editingTreatmentId ? x("Treatment updated.", "ट्रीटमेंट रिकॉर्ड अपडेट हो गया।") : x("Treatment added.", "ट्रीटमेंट रिकॉर्ड जोड़ दिया गया।")
      );
    } catch (e: any) {
      console.error(e);
      const message = String(e?.message ?? x("Could not save treatment.", "ट्रीटमेंट सेव नहीं हो पाया।"));
      if (message.includes("HTTP 403")) {
        Alert.alert(
          x("Role restricted", "रोल अनुमति नहीं"),
          x(
            "Only ADMIN, MANAGER or VET users can log treatments.",
            "ट्रीटमेंट रिकॉर्ड सिर्फ ADMIN, MANAGER या VET जोड़ सकते हैं।"
          )
        );
      } else if (shouldQueueForOffline(e)) {
        await queueTreatmentSave(
          {
            animalId: selectedAnimalId,
            treatmentId: editingTreatmentId,
            payload,
          },
          message
        );
        await refreshPendingSync();
        resetForm();
        Alert.alert(
          x("Saved Offline", "ऑफलाइन सेव"),
          x("Treatment record is queued and will sync automatically.", "ट्रीटमेंट रिकॉर्ड कतार में है और अपने-आप सिंक होगा।")
        );
      } else {
        Alert.alert(x("Save failed", "सेव नहीं हुआ"), message);
      }
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (row: MedicalTreatmentResponse) => {
    if (!canManageTreatments) {
      Alert.alert(
        x("Role restricted", "रोल अनुमति नहीं"),
        x(
          "Only ADMIN, MANAGER or VET users can edit treatments.",
          "ट्रीटमेंट रिकॉर्ड सिर्फ ADMIN, MANAGER या VET बदल सकते हैं।"
        )
      );
      return;
    }

    setEditingTreatmentId(row.treatmentId);
    setTreatmentDate(row.treatmentDate);
    setDiagnosis(row.diagnosis ?? "");
    setMedicineName(row.medicineName ?? "");
    setDose(row.dose ?? "");
    setRoute(row.route ?? "");
    setVeterinarianName(row.veterinarianName ?? "");
    setPrescriptionPhotoUrl(row.prescriptionPhotoUrl ?? "");
    setPrescriptionUploadUri("");
    setWithdrawalTillDate(row.withdrawalTillDate ?? "");
    setFollowUpDate(row.followUpDate ?? "");
    setAutoFollowUpHintDays(null);
    setNotes(row.notes ?? "");
  };

  const onDelete = (row: MedicalTreatmentResponse) => {
    if (!selectedAnimalId || !canManageTreatments) {
      return;
    }

    Alert.alert(
      x("Delete treatment", "ट्रीटमेंट हटाएं"),
      x(`Delete ${row.medicineName} record?`, `${row.medicineName} रिकॉर्ड हटाना है?`),
      [
        { text: x("Cancel", "रद्द"), style: "cancel" },
        {
          text: x("Delete", "हटाएं"),
          style: "destructive",
          onPress: async () => {
            try {
              await TreatmentApi.delete(selectedAnimalId, row.treatmentId);
              await loadTreatments(selectedAnimalId);
              if (editingTreatmentId === row.treatmentId) {
                resetForm();
              }
            } catch (e: any) {
              console.error(e);
              Alert.alert(
                x("Delete failed", "हटाया नहीं गया"),
                e?.message ?? x("Could not delete treatment.", "ट्रीटमेंट रिकॉर्ड हटाया नहीं जा सका।")
              );
            }
          },
        },
      ]
    );
  };

  const dueFilterLabel = (filter: DueFilter) => {
    if (filter === "ALL") return x("ALL", "सभी");
    if (filter === "DUE_TODAY") return x("DUE TODAY", "आज देय");
    if (filter === "DUE_SOON") return x("DUE SOON", "जल्द देय");
    return x("OVERDUE", "समय से बाकी");
  };

  const dueStatusLabel = (raw: string) => {
    if (raw === "OVERDUE") return x("OVERDUE", "समय से बाकी");
    if (raw === "DUE TODAY") return x("DUE TODAY", "आज देय");
    if (raw === "DUE SOON") return x("DUE SOON", "जल्द देय");
    return x("OK", "ठीक");
  };

  const filteredTreatments = useMemo(() => {
    if (dueFilter === "ALL") {
      return treatments;
    }
    return treatments.filter((row) => classifyDue(row.followUpDate, date) === dueFilter);
  }, [date, dueFilter, treatments]);
  const treatmentPendingCount = pendingSync.treatmentSave;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: DairyColors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
            {x("Medical Treatment", "मेडिकल ट्रीटमेंट")}
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x("Per-animal treatment, follow-up and withdrawal tracking", "हर जानवर का ट्रीटमेंट, फॉलो-अप और विथड्रॉल ट्रैक करें")}
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

      <View
        style={{
          marginTop: 10,
          borderWidth: 1,
          borderColor: DairyColors.border,
          borderRadius: 12,
          backgroundColor: DairyColors.surface,
          padding: 10,
        }}
      >
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
          {x("Related Links", "संबंधित लिंक")}
        </Text>
        <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Pressable
            disabled={!selectedAnimal}
            onPress={() =>
              selectedAnimal &&
              router.push({
                pathname: "/health",
                params: { animalId: selectedAnimal.animalId, tag: selectedAnimal.tag },
              })
            }
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: DairyColors.info,
              backgroundColor: DairyColors.infoSoft,
              paddingHorizontal: 12,
              paddingVertical: 9,
            }}
          >
            <Text style={{ color: DairyColors.info, fontWeight: "800" }}>
              {x("Animal Health", "एनिमल हेल्थ")}
            </Text>
          </Pressable>
          <Pressable
            disabled={!selectedAnimal}
            onPress={() =>
              selectedAnimal &&
              router.push({
                pathname: "/breeding",
                params: { animalId: selectedAnimal.animalId, tag: selectedAnimal.tag },
              })
            }
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: DairyColors.primary,
              backgroundColor: DairyColors.primarySoft,
              paddingHorizontal: 12,
              paddingVertical: 9,
            }}
          >
            <Text style={{ color: DairyColors.primary, fontWeight: "800" }}>
              {x("Breeding", "प्रजनन")}
            </Text>
          </Pressable>
        </View>
      </View>

      <View
        style={{
          marginTop: 10,
          borderWidth: 1,
          borderColor: DairyColors.border,
          borderRadius: 10,
          backgroundColor: treatmentPendingCount > 0 ? DairyColors.warningSoft : DairyColors.successSoft,
          padding: 10,
        }}
      >
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
          {treatmentPendingCount > 0
            ? x("Treatment Sync Pending", "ट्रीटमेंट सिंक बाकी")
            : x("Treatment Synced", "ट्रीटमेंट सिंक")}
        </Text>
        <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
          {x(
            `Queued treatment saves ${pendingSync.treatmentSave} | Dead letter ${pendingSync.deadLetter}`,
            `कतार में ट्रीटमेंट सेव ${pendingSync.treatmentSave} | डेड लेटर ${pendingSync.deadLetter}`
          )}
        </Text>
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
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
          {x("Select Animal", "जानवर चुनें")}
        </Text>
        <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
          <TextInput
            value={animalLookup}
            onChangeText={setAnimalLookup}
            placeholder={x("Enter tag (or animal ID)", "टैग दर्ज करें (या Animal ID)")}
            placeholderTextColor="#99A99A"
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: DairyColors.border,
              borderRadius: 10,
              padding: 11,
              color: DairyColors.textPrimary,
              backgroundColor: DairyColors.surfaceMuted,
            }}
          />
          <Pressable
            onPress={onLookupAnimal}
            style={{
              borderRadius: 10,
              paddingHorizontal: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: DairyColors.primary,
            }}
          >
            <Text style={{ color: "white", fontWeight: "800" }}>{x("Select", "चुनें")}</Text>
          </Pressable>
        </View>

        {animals.length === 0 ? (
          <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
            {x("No active animals found.", "कोई सक्रिय जानवर नहीं मिला।")}
          </Text>
        ) : (
          <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {animals.map((animal) => {
              const selected = selectedAnimalId === animal.animalId;
              return (
                <Pressable
                  key={animal.animalId}
                  onPress={() => onSelectAnimal(animal.animalId)}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? DairyColors.primary : DairyColors.border,
                    backgroundColor: selected ? DairyColors.primarySoft : DairyColors.surface,
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                    {animalDisplayLabel(animal)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {activeWithdrawalRows.length > 0 ? (
        <View
          style={{
            marginTop: 12,
            borderWidth: 1,
            borderColor: DairyColors.warning,
            borderRadius: 12,
            backgroundColor: DairyColors.warningSoft,
            padding: 10,
          }}
        >
          <Text style={{ color: DairyColors.warning, fontWeight: "800" }}>
            {x("Withdrawal-risk active", "Withdrawal जोखिम सक्रिय")}
          </Text>
          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
            {x(
              `${activeWithdrawalRows.length} treatment(s) are still inside withdrawal period for this animal.`,
              `इस जानवर के ${activeWithdrawalRows.length} ट्रीटमेंट अभी withdrawal अवधि में हैं।`
            )}
          </Text>
          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
            {x("Milk sales can be blocked until withdrawal end date.", "Withdrawal समाप्ति तक दूध बिक्री ब्लॉक हो सकती है।")}
          </Text>
        </View>
      ) : null}

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
          {editingTreatmentId
            ? x("Update Treatment", "ट्रीटमेंट अपडेट करें")
            : x("Add Treatment", "ट्रीटमेंट जोड़ें")}
        </Text>
        <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
          {x("Selected animal", "चुना गया जानवर")}:{" "}
          {selectedAnimal ? animalDisplayLabel(selectedAnimal) : x("None", "कोई नहीं")}
        </Text>

        <View style={{ marginTop: 8 }}>
          <TextInput
            value={treatmentDate}
            onChangeText={setTreatmentDate}
            placeholder={x("Treatment Date (YYYY-MM-DD)", "ट्रीटमेंट तारीख (YYYY-MM-DD)")}
            placeholderTextColor="#99A99A"
            style={{
              borderWidth: 1,
              borderColor: DairyColors.border,
              borderRadius: 10,
              padding: 10,
              color: DairyColors.textPrimary,
              backgroundColor: DairyColors.surfaceMuted,
            }}
          />
          <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
            <TextInput
              value={followUpDate}
              onChangeText={setFollowUpDate}
              placeholder={x("Follow-up (YYYY-MM-DD)", "फॉलो-अप (YYYY-MM-DD)")}
              placeholderTextColor="#99A99A"
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 10,
                padding: 10,
                color: DairyColors.textPrimary,
                backgroundColor: DairyColors.surfaceMuted,
              }}
            />
            <Pressable
              onPress={() => applyFollowUpSuggestion()}
              style={{
                borderRadius: 10,
                borderWidth: 1,
                borderColor: DairyColors.primary,
                paddingHorizontal: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: DairyColors.primarySoft,
              }}
            >
              <Text style={{ color: DairyColors.primary, fontWeight: "800" }}>{x("Auto", "ऑटो")}</Text>
            </Pressable>
          </View>
          <View style={{ marginTop: 8, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {[3, 5, 7].map((days) => (
              <Pressable
                key={days}
                onPress={() => applyFollowUpSuggestion(days)}
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  paddingHorizontal: 11,
                  paddingVertical: 6,
                  backgroundColor: DairyColors.surface,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{x(`+${days} days`, `+${days} दिन`)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={{ marginTop: 6, color: DairyColors.textSecondary }}>
            {autoFollowUpHintDays == null
              ? x("Tip: Auto suggests follow-up from diagnosis and treatment date.", "टिप: ऑटो निदान और ट्रीटमेंट तारीख से फॉलो-अप सुझाता है।")
              : x(`Auto follow-up set to +${autoFollowUpHintDays} days.`, `ऑटो फॉलो-अप +${autoFollowUpHintDays} दिन पर सेट हुआ।`)}
          </Text>
        </View>

        <TextInput
          value={diagnosis}
          onChangeText={setDiagnosis}
          placeholder={x("Diagnosis (e.g. Mastitis)", "डायग्नोसिस (जैसे मैस्टाइटिस)")}
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
          value={medicineName}
          onChangeText={setMedicineName}
          placeholder={x("Medicine Name", "दवा का नाम")}
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

        <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
          <TextInput
            value={dose}
            onChangeText={setDose}
            placeholder={x("Dose", "डोज")}
            placeholderTextColor="#99A99A"
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: DairyColors.border,
              borderRadius: 10,
              padding: 10,
              color: DairyColors.textPrimary,
              backgroundColor: DairyColors.surfaceMuted,
            }}
          />
          <TextInput
            value={route}
            onChangeText={setRoute}
            placeholder={x("Route (IM/IV/Oral)", "रूट (IM/IV/Oral)")}
            placeholderTextColor="#99A99A"
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: DairyColors.border,
              borderRadius: 10,
              padding: 10,
              color: DairyColors.textPrimary,
              backgroundColor: DairyColors.surfaceMuted,
            }}
          />
        </View>

        <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
          <TextInput
            value={veterinarianName}
            onChangeText={setVeterinarianName}
            placeholder={x("Vet Name", "डॉक्टर का नाम")}
            placeholderTextColor="#99A99A"
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: DairyColors.border,
              borderRadius: 10,
              padding: 10,
              color: DairyColors.textPrimary,
              backgroundColor: DairyColors.surfaceMuted,
            }}
          />
          <TextInput
            value={withdrawalTillDate}
            onChangeText={setWithdrawalTillDate}
            placeholder={x("Withdrawal till (YYYY-MM-DD)", "विथड्रॉल अंत (YYYY-MM-DD)")}
            placeholderTextColor="#99A99A"
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: DairyColors.border,
              borderRadius: 10,
              padding: 10,
              color: DairyColors.textPrimary,
              backgroundColor: DairyColors.surfaceMuted,
            }}
          />
        </View>

        <TextInput
          value={prescriptionPhotoUrl}
          onChangeText={setPrescriptionPhotoUrl}
          placeholder={x("Prescription photo URL (http/https)", "प्रिस्क्रिप्शन फोटो URL (http/https)")}
          placeholderTextColor="#99A99A"
          autoCapitalize="none"
          autoCorrect={false}
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
        <Text style={{ marginTop: 6, color: DairyColors.textSecondary }}>
          {x(
            "You can paste URL directly, or upload from local URI/path below.",
            "आप सीधे URL भर सकते हैं, या नीचे local URI/path से अपलोड कर सकते हैं।"
          )}
        </Text>
        <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
          <TextInput
            value={prescriptionUploadUri}
            onChangeText={setPrescriptionUploadUri}
            placeholder={x("Local file URI/path (file://..., content://...)", "Local file URI/path (file://..., content://...)")}
            placeholderTextColor="#99A99A"
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: DairyColors.border,
              borderRadius: 10,
              padding: 10,
              color: DairyColors.textPrimary,
              backgroundColor: DairyColors.surfaceMuted,
            }}
          />
          <Pressable
            disabled={uploadingPrescription}
            onPress={uploadPrescriptionFromUri}
            style={{
              borderRadius: 10,
              paddingHorizontal: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: uploadingPrescription ? DairyColors.textSecondary : DairyColors.info,
            }}
          >
            <Text style={{ color: "white", fontWeight: "800" }}>
              {uploadingPrescription ? x("Uploading...", "अपलोड...") : x("Upload", "अपलोड")}
            </Text>
          </Pressable>
        </View>
        <Text style={{ marginTop: 6, color: DairyColors.textSecondary }}>
          {x(
            "Allowed file types: JPG, PNG, WEBP, PDF.",
            "स्वीकार्य फाइल प्रकार: JPG, PNG, WEBP, PDF."
          )}
        </Text>

        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder={x("Notes", "नोट्स")}
          placeholderTextColor="#99A99A"
          multiline
          numberOfLines={3}
          style={{
            marginTop: 8,
            borderWidth: 1,
            borderColor: DairyColors.border,
            borderRadius: 10,
            padding: 10,
            color: DairyColors.textPrimary,
            backgroundColor: DairyColors.surfaceMuted,
            minHeight: 78,
            textAlignVertical: "top",
          }}
        />

        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <Pressable
            disabled={saving || !canManageTreatments || !selectedAnimal}
            onPress={saveTreatment}
            style={{
              flex: 1,
              borderRadius: 10,
              backgroundColor:
                saving || !canManageTreatments || !selectedAnimal
                  ? DairyColors.textSecondary
                  : DairyColors.primary,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "white", fontWeight: "800" }}>
              {saving
                ? x("Saving...", "सेव हो रहा है...")
                : editingTreatmentId
                  ? x("Update Treatment", "ट्रीटमेंट अपडेट करें")
                  : x("Add Treatment", "ट्रीटमेंट जोड़ें")}
            </Text>
          </Pressable>
          {editingTreatmentId ? (
            <Pressable
              onPress={resetForm}
              style={{
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 10,
                paddingHorizontal: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: DairyColors.surface,
              }}
            >
              <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>{x("Cancel", "रद्द करें")}</Text>
            </Pressable>
          ) : null}
        </View>
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
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
          {x(`Treatment Records (${selectedAnimal?.tag ?? "No animal"})`, `ट्रीटमेंट रिकॉर्ड (${selectedAnimal?.tag ?? "जानवर नहीं"})`)}
        </Text>

        <View style={{ marginTop: 8, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {FILTERS.map((entry) => (
            <Pressable
              key={entry}
              onPress={() => setDueFilter(entry)}
              style={{
                borderWidth: 1,
                borderColor: dueFilter === entry ? DairyColors.primary : DairyColors.border,
                backgroundColor: dueFilter === entry ? DairyColors.primarySoft : DairyColors.surface,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{dueFilterLabel(entry)}</Text>
            </Pressable>
          ))}
        </View>

        {filteredTreatments.length === 0 ? (
          <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
            {x("No treatment records for filter.", "इस फिल्टर में कोई ट्रीटमेंट रिकॉर्ड नहीं है।")}
          </Text>
        ) : (
          filteredTreatments.map((row) => {
            const due = dueTone(classifyDue(row.followUpDate, date));
            const withdrawalActive = !!row.withdrawalTillDate && row.withdrawalTillDate >= date;
            return (
              <View
                key={row.treatmentId}
                style={{
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  borderRadius: 10,
                  padding: 10,
                  backgroundColor: DairyColors.surfaceMuted,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", flex: 1 }}>
                    {row.diagnosis} | {row.medicineName}
                  </Text>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <View
                      style={{
                        borderRadius: 999,
                        backgroundColor: due.background,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                      }}
                    >
                      <Text style={{ color: due.text, fontWeight: "700" }}>{dueStatusLabel(due.label)}</Text>
                    </View>
                    {withdrawalActive ? (
                      <View
                        style={{
                          borderRadius: 999,
                          backgroundColor: DairyColors.warningSoft,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                        }}
                      >
                        <Text style={{ color: DairyColors.warning, fontWeight: "700" }}>
                          {x("WITHDRAWAL ACTIVE", "WITHDRAWAL सक्रिय")}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x(`Treatment: ${row.treatmentDate} | Follow-up: ${row.followUpDate ?? "-"}`, `ट्रीटमेंट: ${row.treatmentDate} | फॉलो-अप: ${row.followUpDate ?? "-"}`)}
                </Text>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x(`Dose: ${row.dose ?? "-"} | Route: ${row.route ?? "-"}`, `डोज: ${row.dose ?? "-"} | रूट: ${row.route ?? "-"}`)}
                </Text>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x(`Withdrawal till: ${row.withdrawalTillDate ?? "-"}`, `विथड्रॉल अंत: ${row.withdrawalTillDate ?? "-"}`)}
                </Text>
                {row.prescriptionPhotoUrl ? (
                  <Pressable
                    onPress={() => {
                      Linking.openURL(row.prescriptionPhotoUrl ?? "").catch((e) => {
                        console.error(e);
                        Alert.alert(
                          x("Open failed", "खुल नहीं पाया"),
                          x("Could not open prescription URL.", "प्रिस्क्रिप्शन URL नहीं खुल पाया।")
                        );
                      });
                    }}
                    style={{
                      marginTop: 4,
                      alignSelf: "flex-start",
                      borderWidth: 1,
                      borderColor: DairyColors.info,
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      backgroundColor: DairyColors.infoSoft,
                    }}
                  >
                    <Text style={{ color: DairyColors.info, fontWeight: "700" }}>
                      {x("Open Prescription Photo", "प्रिस्क्रिप्शन फोटो खोलें")}
                    </Text>
                  </Pressable>
                ) : null}
                {row.veterinarianName ? (
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                    {x(`Vet: ${row.veterinarianName}`, `डॉक्टर: ${row.veterinarianName}`)}
                  </Text>
                ) : null}
                {row.notes ? (
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                    {x(`Notes: ${row.notes}`, `नोट्स: ${row.notes}`)}
                  </Text>
                ) : null}

                {canManageTreatments ? (
                  <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
                    <Pressable
                      onPress={() => onEdit(row)}
                      style={{
                        borderWidth: 1,
                        borderColor: DairyColors.border,
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        backgroundColor: DairyColors.surface,
                      }}
                    >
                      <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{x("Edit", "बदलें")}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => onDelete(row)}
                      style={{
                        borderWidth: 1,
                        borderColor: DairyColors.danger,
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        backgroundColor: DairyColors.dangerSoft,
                      }}
                    >
                      <Text style={{ color: DairyColors.danger, fontWeight: "700" }}>{x("Delete", "हटाएं")}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
