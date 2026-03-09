import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  AnimalApi,
  AnimalResponse,
  BreedingApi,
  BreedingCalfGender,
  BreedingCalvingOutcome,
  BreedingEventResponse,
  BreedingPregnancyResult,
  BreedingSummaryResponse,
  CreateBreedingEventPayload,
} from "@/src/services/api";
import { DairyColors } from "@/src/constants/dairy-theme";
import { todayLocalISO } from "@/src/utils/date";
import { useI18n } from "@/src/state/i18n";
import { useAuth } from "@/src/state/auth";
import { DateInput } from "../../../components/date-input";

const PREGNANCY_OPTIONS: BreedingPregnancyResult[] = ["PENDING", "PREGNANT", "NOT_PREGNANT"];
const CALF_GENDER_OPTIONS: BreedingCalfGender[] = ["MALE", "FEMALE", "UNKNOWN"];
const CALVING_OUTCOME_OPTIONS: BreedingCalvingOutcome[] = ["LIVE", "STILLBIRTH", "ABORTION", "UNKNOWN"];

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

type NextActionCode =
  | "ADD_INSEMINATION"
  | "SCHEDULE_PREG_CHECK"
  | "SET_EXPECTED_CALVING"
  | "RECORD_CALVING"
  | "START_NEW_CYCLE"
  | "COMPLETE";

type NextAction = {
  code: NextActionCode;
  recommendedDate?: string | null;
};

function resolveNextAction(row: BreedingEventResponse, todayIsoDate: string): NextAction {
  if (!row.inseminationDate) {
    return { code: "ADD_INSEMINATION", recommendedDate: todayIsoDate };
  }

  if (row.inseminationDate && !row.pregnancyCheckDate && !row.actualCalvingDate) {
    return { code: "SCHEDULE_PREG_CHECK", recommendedDate: addDaysIso(row.inseminationDate, 60) ?? todayIsoDate };
  }

  if (row.pregnancyResult === "NOT_PREGNANT" && !row.actualCalvingDate) {
    return { code: "START_NEW_CYCLE", recommendedDate: todayIsoDate };
  }

  if (row.pregnancyResult === "PREGNANT" && !row.expectedCalvingDate && !row.actualCalvingDate) {
    const expected = row.inseminationDate ? addDaysIso(row.inseminationDate, 283) : null;
    return { code: "SET_EXPECTED_CALVING", recommendedDate: expected ?? todayIsoDate };
  }

  if ((row.pregnancyResult === "PREGNANT" || !!row.expectedCalvingDate) && !row.actualCalvingDate) {
    return { code: "RECORD_CALVING", recommendedDate: row.expectedCalvingDate ?? todayIsoDate };
  }

  return { code: "COMPLETE" };
}

function numberTone(value: number) {
  if (value > 0) {
    return { text: DairyColors.warning, background: DairyColors.warningSoft };
  }
  return { text: DairyColors.success, background: DairyColors.successSoft };
}

function animalDisplayLabel(animal: AnimalResponse) {
  return animal.tag?.trim() || animal.name?.trim() || animal.animalId;
}

export default function BreedingScreen() {
  const params = useLocalSearchParams<{ animalId?: string; tag?: string }>();
  const router = useRouter();
  const { x } = useI18n();
  const { hasAnyRole } = useAuth();
  const canManageBreeding = hasAnyRole("ADMIN", "MANAGER", "VET");

  const [date] = useState(todayLocalISO());
  const [animals, setAnimals] = useState<AnimalResponse[]>([]);
  const [selectedAnimalId, setSelectedAnimalId] = useState("");
  const [animalLookup, setAnimalLookup] = useState("");
  const [summary, setSummary] = useState<BreedingSummaryResponse | null>(null);
  const [events, setEvents] = useState<BreedingEventResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const [heatDate, setHeatDate] = useState(todayLocalISO());
  const [inseminationDate, setInseminationDate] = useState("");
  const [sireTag, setSireTag] = useState("");
  const [pregnancyCheckDate, setPregnancyCheckDate] = useState("");
  const [pregnancyResult, setPregnancyResult] = useState<BreedingPregnancyResult>("PENDING");
  const [expectedCalvingDate, setExpectedCalvingDate] = useState("");
  const [actualCalvingDate, setActualCalvingDate] = useState("");
  const [calfAnimalId, setCalfAnimalId] = useState("");
  const [calfTag, setCalfTag] = useState("");
  const [calfGender, setCalfGender] = useState<BreedingCalfGender>("UNKNOWN");
  const [calvingOutcome, setCalvingOutcome] = useState<BreedingCalvingOutcome>("UNKNOWN");
  const [notes, setNotes] = useState("");

  const selectedAnimal = useMemo(
    () => animals.find((a) => a.animalId === selectedAnimalId) ?? null,
    [animals, selectedAnimalId]
  );

  const latestEvent = useMemo(() => events[0] ?? null, [events]);
  const latestNextAction = useMemo(
    () => (latestEvent ? resolveNextAction(latestEvent, date) : null),
    [date, latestEvent]
  );

  const selectedAnimalAlerts = useMemo(() => {
    const counts = {
      pregCheckDueToday: 0,
      pregCheckDueSoon: 0,
      pregCheckOverdue: 0,
      calvingDueToday: 0,
      calvingDueSoon: 0,
      calvingOverdue: 0,
    };
    const dueSoonEnd = addDaysIso(date, 7);

    events.forEach((row) => {
      if (row.inseminationDate && !row.pregnancyCheckDate && !row.actualCalvingDate) {
        const pregCheckDue = addDaysIso(row.inseminationDate, 60);
        if (pregCheckDue) {
          if (pregCheckDue < date) {
            counts.pregCheckOverdue += 1;
          } else if (pregCheckDue === date) {
            counts.pregCheckDueToday += 1;
          } else if (dueSoonEnd && pregCheckDue <= dueSoonEnd) {
            counts.pregCheckDueSoon += 1;
          }
        }
      }

      if (row.expectedCalvingDate && !row.actualCalvingDate) {
        if (row.expectedCalvingDate < date) {
          counts.calvingOverdue += 1;
        } else if (row.expectedCalvingDate === date) {
          counts.calvingDueToday += 1;
        } else if (dueSoonEnd && row.expectedCalvingDate <= dueSoonEnd) {
          counts.calvingDueSoon += 1;
        }
      }
    });
    return counts;
  }, [date, events]);

  const pregnancyLabel = (value: BreedingPregnancyResult) => {
    if (value === "PREGNANT") return x("Pregnant", "गाभिन");
    if (value === "NOT_PREGNANT") return x("Not Pregnant", "गाभिन नहीं");
    return x("Pending", "पेंडिंग");
  };

  const calfGenderLabel = (value: BreedingCalfGender) => {
    if (value === "MALE") return x("Male", "नर");
    if (value === "FEMALE") return x("Female", "मादा");
    return x("Unknown", "अज्ञात");
  };

  const calvingOutcomeLabel = (value: BreedingCalvingOutcome) => {
    if (value === "LIVE") return x("Live", "जिंदा बच्चा");
    if (value === "STILLBIRTH") return x("Stillbirth", "मृत जन्म");
    if (value === "ABORTION") return x("Abortion", "गर्भपात");
    return x("Unknown", "अज्ञात");
  };

  const nextActionLabel = (code: NextActionCode) => {
    if (code === "ADD_INSEMINATION") return x("Add insemination", "इंसेमिनेशन जोड़ें");
    if (code === "SCHEDULE_PREG_CHECK") return x("Schedule pregnancy check", "गर्भ जांच तय करें");
    if (code === "SET_EXPECTED_CALVING") return x("Set expected calving date", "अपेक्षित बछड़ा तारीख सेट करें");
    if (code === "RECORD_CALVING") return x("Record calving", "बछड़ा रिकॉर्ड करें");
    if (code === "START_NEW_CYCLE") return x("Start new heat cycle", "नया हीट चक्र शुरू करें");
    return x("Lifecycle complete", "लाइफसाइकिल पूर्ण");
  };

  const applyLatestAction = () => {
    if (!latestNextAction) {
      return;
    }
    if (latestNextAction.code === "ADD_INSEMINATION") {
      setInseminationDate(latestNextAction.recommendedDate ?? date);
      return;
    }
    if (latestNextAction.code === "SCHEDULE_PREG_CHECK") {
      setPregnancyCheckDate(latestNextAction.recommendedDate ?? date);
      setPregnancyResult("PENDING");
      return;
    }
    if (latestNextAction.code === "SET_EXPECTED_CALVING") {
      setExpectedCalvingDate(latestNextAction.recommendedDate ?? date);
      setPregnancyResult("PREGNANT");
      return;
    }
    if (latestNextAction.code === "RECORD_CALVING") {
      setActualCalvingDate(date);
      setCalvingOutcome("LIVE");
      return;
    }
    if (latestNextAction.code === "START_NEW_CYCLE") {
      setHeatDate(date);
      setInseminationDate("");
      setPregnancyCheckDate("");
      setPregnancyResult("PENDING");
      setExpectedCalvingDate("");
      setActualCalvingDate("");
    }
  };

  const resetForm = () => {
    setEditingEventId(null);
    setHeatDate(todayLocalISO());
    setInseminationDate("");
    setSireTag("");
    setPregnancyCheckDate("");
    setPregnancyResult("PENDING");
    setExpectedCalvingDate("");
    setActualCalvingDate("");
    setCalfAnimalId("");
    setCalfTag("");
    setCalfGender("UNKNOWN");
    setCalvingOutcome("UNKNOWN");
    setNotes("");
  };

  const loadEvents = useCallback(async (animalId: string) => {
    if (!animalId) {
      setEvents([]);
      return;
    }
    setEvents(await BreedingApi.list(animalId));
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [animalRows, summaryRes] = await Promise.all([
        AnimalApi.list({ active: true }),
        BreedingApi.summary(date, 7),
      ]);
      setAnimals(animalRows);
      setSummary(summaryRes);

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
      await loadEvents(nextAnimalId);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load breeding data.", "प्रजनन डेटा लोड नहीं हो पाया।")
      );
    } finally {
      setLoading(false);
    }
  }, [date, loadEvents, params.animalId, params.tag, selectedAnimalId, x]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      await loadEvents(animalId);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load breeding records.", "प्रजनन रिकॉर्ड लोड नहीं हो पाए।")
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
        x("Enter tag to select an animal. Animal ID also works.", "जानवर चुनने के लिए टैग डालें। Animal ID भी चलेगा।")
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
        x(
          "No active animal found with this tag.",
          "इस टैग से कोई सक्रिय जानवर नहीं मिला।"
        )
      );
      return;
    }

    await onSelectAnimal(partialMatch.animalId);
  };

  const saveEvent = async () => {
    if (!selectedAnimalId) {
      Alert.alert(x("Select animal", "जानवर चुनें"), x("Please select an animal first.", "पहले जानवर चुनें।"));
      return;
    }
    if (!canManageBreeding) {
      Alert.alert(
        x("Role restricted", "रोल अनुमति नहीं"),
        x(
          "Only ADMIN, MANAGER or VET users can add or edit breeding records.",
          "प्रजनन रिकॉर्ड सिर्फ ADMIN, MANAGER या VET जोड़/बदल सकते हैं।"
        )
      );
      return;
    }

    if (!heatDate.trim() || !isIsoDate(heatDate.trim())) {
      Alert.alert(
        x("Invalid date", "गलत तारीख"),
        x("Heat date is required in YYYY-MM-DD format.", "हीट तारीख YYYY-MM-DD फॉर्मेट में जरूरी है।")
      );
      return;
    }

    const optionalDates = [
      inseminationDate.trim(),
      pregnancyCheckDate.trim(),
      expectedCalvingDate.trim(),
      actualCalvingDate.trim(),
    ].filter(Boolean);
    if (optionalDates.some((d) => !isIsoDate(d))) {
      Alert.alert(
        x("Invalid date", "गलत तारीख"),
        x("Use YYYY-MM-DD format for all dates.", "सभी तारीखें YYYY-MM-DD फॉर्मेट में रखें।")
      );
      return;
    }

    if (inseminationDate.trim() && inseminationDate.trim() < heatDate.trim()) {
      Alert.alert(
        x("Invalid dates", "गलत तारीखें"),
        x("Insemination date cannot be before heat date.", "इंसेमिनेशन तारीख हीट तारीख से पहले नहीं हो सकती।")
      );
      return;
    }
    if (actualCalvingDate.trim() && actualCalvingDate.trim() < heatDate.trim()) {
      Alert.alert(
        x("Invalid dates", "गलत तारीखें"),
        x("Actual calving date cannot be before heat date.", "वास्तविक बछड़ा तारीख हीट तारीख से पहले नहीं हो सकती।")
      );
      return;
    }

    const payload: CreateBreedingEventPayload = {
      heatDate: heatDate.trim(),
      inseminationDate: inseminationDate.trim() || null,
      sireTag: sireTag.trim() || null,
      pregnancyCheckDate: pregnancyCheckDate.trim() || null,
      pregnancyResult,
      expectedCalvingDate: expectedCalvingDate.trim() || null,
      actualCalvingDate: actualCalvingDate.trim() || null,
      calfAnimalId: calfAnimalId.trim() || null,
      calfTag: calfTag.trim() || null,
      calfGender,
      calvingOutcome,
      notes: notes.trim() || null,
    };

    try {
      setSaving(true);
      if (editingEventId) {
        await BreedingApi.update(selectedAnimalId, editingEventId, payload);
      } else {
        await BreedingApi.create(selectedAnimalId, payload);
      }

      await Promise.all([loadEvents(selectedAnimalId), BreedingApi.summary(date, 7).then(setSummary)]);
      resetForm();
      Alert.alert(
        x("Saved", "सेव हो गया"),
        editingEventId ? x("Breeding record updated.", "प्रजनन रिकॉर्ड अपडेट हो गया।") : x("Breeding record added.", "प्रजनन रिकॉर्ड जोड़ दिया गया।")
      );
    } catch (e: any) {
      console.error(e);
      const message = String(e?.message ?? x("Could not save breeding record.", "प्रजनन रिकॉर्ड सेव नहीं हो पाया।"));
      if (message.includes("HTTP 403")) {
        Alert.alert(
          x("Role restricted", "रोल अनुमति नहीं"),
          x(
            "Only ADMIN, MANAGER or VET users can add or edit breeding records.",
            "प्रजनन रिकॉर्ड सिर्फ ADMIN, MANAGER या VET जोड़/बदल सकते हैं।"
          )
        );
      } else {
        Alert.alert(x("Save failed", "सेव नहीं हुआ"), message);
      }
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (row: BreedingEventResponse) => {
    if (!canManageBreeding) {
      Alert.alert(
        x("Role restricted", "रोल अनुमति नहीं"),
        x(
          "Only ADMIN, MANAGER or VET users can edit breeding records.",
          "प्रजनन रिकॉर्ड सिर्फ ADMIN, MANAGER या VET बदल सकते हैं।"
        )
      );
      return;
    }

    setEditingEventId(row.breedingEventId);
    setHeatDate(row.heatDate);
    setInseminationDate(row.inseminationDate ?? "");
    setSireTag(row.sireTag ?? "");
    setPregnancyCheckDate(row.pregnancyCheckDate ?? "");
    setPregnancyResult(row.pregnancyResult ?? "PENDING");
    setExpectedCalvingDate(row.expectedCalvingDate ?? "");
    setActualCalvingDate(row.actualCalvingDate ?? "");
    setCalfAnimalId(row.calfAnimalId ?? "");
    setCalfTag(row.calfTag ?? "");
    setCalfGender(row.calfGender ?? "UNKNOWN");
    setCalvingOutcome(row.calvingOutcome ?? "UNKNOWN");
    setNotes(row.notes ?? "");
  };

  const onDelete = (row: BreedingEventResponse) => {
    if (!canManageBreeding) {
      Alert.alert(
        x("Role restricted", "रोल अनुमति नहीं"),
        x(
          "Only ADMIN, MANAGER or VET users can delete breeding records.",
          "प्रजनन रिकॉर्ड सिर्फ ADMIN, MANAGER या VET हटा सकते हैं।"
        )
      );
      return;
    }

    Alert.alert(
      x("Delete record?", "रिकॉर्ड हटाएं?"),
      x("This breeding record will be removed permanently.", "यह प्रजनन रिकॉर्ड हमेशा के लिए हट जाएगा।"),
      [
        { text: x("Cancel", "रद्द करें"), style: "cancel" },
        {
          text: x("Delete", "हटाएं"),
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              await BreedingApi.delete(row.animalId, row.breedingEventId);
              await Promise.all([loadEvents(row.animalId), BreedingApi.summary(date, 7).then(setSummary)]);
            } catch (e: any) {
              console.error(e);
              Alert.alert(
                x("Delete failed", "हटाना असफल"),
                e?.message ?? x("Could not delete breeding record.", "प्रजनन रिकॉर्ड नहीं हट पाया।")
              );
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: DairyColors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
            {x("Breeding & Calving", "प्रजनन और बछड़ा रिकॉर्ड")}
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x("Heat, insemination, pregnancy and calving lifecycle", "हीट, इंसेमिनेशन, गाभिन जांच और बछड़ा जीवनचक्र")}
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
          marginTop: 12,
          borderWidth: 1,
          borderColor: DairyColors.border,
          borderRadius: 14,
          backgroundColor: DairyColors.surface,
          padding: 12,
        }}
      >
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
          {x("Related Links", "संबंधित लिंक")}
        </Text>
        <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
          {x(
            "Jump to vaccination/deworming and medical treatment for this animal.",
            "इस जानवर के टीका/पेट दवा और मेडिकल ट्रीटमेंट स्क्रीन पर जाएं।"
          )}
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
                pathname: "/treatments",
                params: { animalId: selectedAnimal.animalId, tag: selectedAnimal.tag },
              })
            }
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: DairyColors.warning,
              backgroundColor: DairyColors.warningSoft,
              paddingHorizontal: 12,
              paddingVertical: 9,
            }}
          >
            <Text style={{ color: DairyColors.warning, fontWeight: "800" }}>
              {x("Medical Treatment", "मेडिकल ट्रीटमेंट")}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {[
          {
            label: x("Calving Due Today", "आज बछड़ा देय"),
            value: summary?.calvingDueToday ?? 0,
          },
          {
            label: x("Calving Due Soon", "जल्द बछड़ा देय"),
            value: summary?.calvingDueSoon ?? 0,
          },
          {
            label: x("Calving Overdue", "बछड़ा देरी"),
            value: summary?.calvingOverdue ?? 0,
          },
          {
            label: x("Open Pregnancies", "चल रही गर्भावस्था"),
            value: summary?.openPregnancies ?? 0,
          },
        ].map((card) => {
          const tone = numberTone(card.value);
          return (
            <View
              key={card.label}
              style={{
                flex: 1,
                minWidth: 150,
                borderRadius: 12,
                backgroundColor: tone.background,
                padding: 10,
              }}
            >
              <Text style={{ color: DairyColors.textSecondary }}>{card.label}</Text>
              <Text style={{ marginTop: 4, color: tone.text, fontWeight: "800", fontSize: 20 }}>{card.value}</Text>
            </View>
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
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
          {x("Select Animal", "जानवर चुनें")}
        </Text>
        <Text style={{ marginTop: 6, color: DairyColors.textSecondary }}>
          {x(
            "Select by tag. (Animal ID also works; scanner support can pass tag here later.)",
            "टैग से चुनें। (Animal ID भी चलेगा; बाद में स्कैनर का टैग यहीं आएगा।)"
          )}
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
            <Text style={{ color: "white", fontWeight: "800" }}>
              {x("Select", "चुनें")}
            </Text>
          </Pressable>
        </View>
        {animals.length === 0 ? (
          <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
            {x("No active animals found.", "कोई सक्रिय जानवर नहीं मिला।")}
          </Text>
        ) : (
          <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {animals.map((animal) => {
              const selected = animal.animalId === selectedAnimalId;
              return (
                <Pressable
                  key={animal.animalId}
                  onPress={() => onSelectAnimal(animal.animalId)}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? DairyColors.primary : DairyColors.border,
                    backgroundColor: selected ? DairyColors.primarySoft : DairyColors.surfaceMuted,
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
          {x("Clinical Alerts (Selected Animal)", "क्लिनिकल अलर्ट (चुना जानवर)")}
        </Text>
        <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[
            {
              label: x("Preg Check Overdue", "गर्भ जांच बाकी"),
              value: selectedAnimalAlerts.pregCheckOverdue,
              background: DairyColors.dangerSoft,
            },
            {
              label: x("Preg Check Soon", "गर्भ जांच जल्द"),
              value: selectedAnimalAlerts.pregCheckDueSoon + selectedAnimalAlerts.pregCheckDueToday,
              background: DairyColors.warningSoft,
            },
            {
              label: x("Calving Overdue", "बछड़ा देरी"),
              value: selectedAnimalAlerts.calvingOverdue,
              background: DairyColors.dangerSoft,
            },
            {
              label: x("Calving Soon", "बछड़ा जल्द"),
              value: selectedAnimalAlerts.calvingDueSoon + selectedAnimalAlerts.calvingDueToday,
              background: DairyColors.warningSoft,
            },
          ].map((card) => (
            <View
              key={card.label}
              style={{
                flex: 1,
                minWidth: 140,
                borderRadius: 10,
                padding: 10,
                backgroundColor: card.background,
              }}
            >
              <Text style={{ color: DairyColors.textSecondary }}>{card.label}</Text>
              <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>
                {card.value}
              </Text>
            </View>
          ))}
        </View>

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
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
            {x("Next Recommended Step", "अगला सुझाया कदम")}
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {latestNextAction
              ? nextActionLabel(latestNextAction.code)
              : x("No prior record. Start by adding heat/insemination entry.", "कोई पिछला रिकॉर्ड नहीं। हीट/इंसेमिनेशन से शुरू करें।")}
          </Text>
          {latestNextAction?.recommendedDate ? (
            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
              {x(
                `Suggested date: ${latestNextAction.recommendedDate}`,
                `सुझाई तारीख: ${latestNextAction.recommendedDate}`
              )}
            </Text>
          ) : null}
          {canManageBreeding && latestNextAction && latestNextAction.code !== "COMPLETE" ? (
            <Pressable
              onPress={applyLatestAction}
              style={{
                marginTop: 8,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                alignSelf: "flex-start",
                backgroundColor: DairyColors.primary,
              }}
            >
              <Text style={{ color: "white", fontWeight: "800" }}>
                {x("Apply to Form", "फॉर्म में भरें")}
              </Text>
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
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
          {editingEventId
            ? x("Edit Breeding Record", "प्रजनन रिकॉर्ड बदलें")
            : x("Add Breeding Record", "प्रजनन रिकॉर्ड जोड़ें")}
        </Text>
        <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
          {x("Selected animal", "चुना गया जानवर")}:{" "}
          {selectedAnimal
            ? animalDisplayLabel(selectedAnimal)
            : x("None", "कोई नहीं")}
        </Text>

        <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
          {x("Heat Date (Required)", "हीट तारीख (जरूरी)")}
        </Text>
        <DateInput
          value={heatDate}
          onChangeText={setHeatDate}
          placeholder="YYYY-MM-DD"
        />

        <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
              {x("Insemination Date", "इंसेमिनेशन तारीख")}
            </Text>
            <DateInput
              value={inseminationDate}
              onChangeText={setInseminationDate}
              placeholder="YYYY-MM-DD"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
              {x("Pregnancy Check Date", "गर्भ जांच तारीख")}
            </Text>
            <DateInput
              value={pregnancyCheckDate}
              onChangeText={setPregnancyCheckDate}
              placeholder="YYYY-MM-DD"
            />
          </View>
        </View>

        <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
          {x("Sire/Bull Tag", "बैल/सायर टैग")}
        </Text>
        <TextInput
          value={sireTag}
          onChangeText={setSireTag}
          placeholder={x("e.g. BULL-09", "जैसे BULL-09")}
          placeholderTextColor="#99A99A"
          style={{
            marginTop: 6,
            borderWidth: 1,
            borderColor: DairyColors.border,
            borderRadius: 10,
            padding: 11,
            color: DairyColors.textPrimary,
            backgroundColor: DairyColors.surfaceMuted,
          }}
        />

        <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
          {x("Pregnancy Result", "गर्भावस्था परिणाम")}
        </Text>
        <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {PREGNANCY_OPTIONS.map((option) => {
            const selected = pregnancyResult === option;
            return (
              <Pressable
                key={option}
                onPress={() => setPregnancyResult(option)}
                style={{
                  borderWidth: 1,
                  borderColor: selected ? DairyColors.primary : DairyColors.border,
                  backgroundColor: selected ? DairyColors.primarySoft : DairyColors.surface,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{pregnancyLabel(option)}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
              {x("Expected Calving Date", "अपेक्षित बछड़ा तारीख")}
            </Text>
            <DateInput
              value={expectedCalvingDate}
              onChangeText={setExpectedCalvingDate}
              placeholder="YYYY-MM-DD"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
              {x("Actual Calving Date", "वास्तविक बछड़ा तारीख")}
            </Text>
            <DateInput
              value={actualCalvingDate}
              onChangeText={setActualCalvingDate}
              placeholder="YYYY-MM-DD"
            />
          </View>
        </View>

        <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
              {x("Calf Animal ID", "बछड़ा Animal ID")}
            </Text>
            <TextInput
              value={calfAnimalId}
              onChangeText={setCalfAnimalId}
              placeholder={x("Optional", "वैकल्पिक")}
              placeholderTextColor="#99A99A"
              style={{
                marginTop: 6,
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 10,
                padding: 11,
                color: DairyColors.textPrimary,
                backgroundColor: DairyColors.surfaceMuted,
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
              {x("Calf Tag", "बछड़ा टैग")}
            </Text>
            <TextInput
              value={calfTag}
              onChangeText={setCalfTag}
              placeholder={x("Optional", "वैकल्पिक")}
              placeholderTextColor="#99A99A"
              style={{
                marginTop: 6,
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 10,
                padding: 11,
                color: DairyColors.textPrimary,
                backgroundColor: DairyColors.surfaceMuted,
              }}
            />
          </View>
        </View>

        <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
          {x("Calf Gender", "बछड़े का लिंग")}
        </Text>
        <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {CALF_GENDER_OPTIONS.map((option) => {
            const selected = calfGender === option;
            return (
              <Pressable
                key={option}
                onPress={() => setCalfGender(option)}
                style={{
                  borderWidth: 1,
                  borderColor: selected ? DairyColors.primary : DairyColors.border,
                  backgroundColor: selected ? DairyColors.primarySoft : DairyColors.surface,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{calfGenderLabel(option)}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
          {x("Calving Outcome", "बछड़ा परिणाम")}
        </Text>
        <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {CALVING_OUTCOME_OPTIONS.map((option) => {
            const selected = calvingOutcome === option;
            return (
              <Pressable
                key={option}
                onPress={() => setCalvingOutcome(option)}
                style={{
                  borderWidth: 1,
                  borderColor: selected ? DairyColors.primary : DairyColors.border,
                  backgroundColor: selected ? DairyColors.primarySoft : DairyColors.surface,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{calvingOutcomeLabel(option)}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
          {x("Notes", "नोट्स")}
        </Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder={x("Any remarks", "कोई टिप्पणी")}
          placeholderTextColor="#99A99A"
          multiline
          numberOfLines={3}
          style={{
            marginTop: 6,
            borderWidth: 1,
            borderColor: DairyColors.border,
            borderRadius: 10,
            padding: 11,
            color: DairyColors.textPrimary,
            backgroundColor: DairyColors.surfaceMuted,
            minHeight: 78,
            textAlignVertical: "top",
          }}
        />

        <Pressable
          onPress={saveEvent}
          disabled={saving}
          style={{
            marginTop: 12,
            borderRadius: 10,
            alignItems: "center",
            padding: 12,
            backgroundColor: saving ? DairyColors.textSecondary : DairyColors.primary,
          }}
        >
          <Text style={{ color: "white", fontWeight: "800" }}>
            {saving
              ? x("Saving...", "सेव हो रहा है...")
              : editingEventId
                ? x("Update Record", "रिकॉर्ड अपडेट करें")
                : x("Add Record", "रिकॉर्ड जोड़ें")}
          </Text>
        </Pressable>

        <Pressable
          onPress={resetForm}
          style={{
            marginTop: 8,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: DairyColors.border,
            alignItems: "center",
            padding: 11,
            backgroundColor: DairyColors.surface,
          }}
        >
          <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
            {x("Clear Form", "फॉर्म साफ करें")}
          </Text>
        </Pressable>
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
          {x("Breeding Timeline", "प्रजनन टाइमलाइन")}
        </Text>
        {events.length === 0 ? (
          <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
            {loading
              ? x("Loading...", "लोड हो रहा है...")
              : x("No breeding records for selected animal.", "चुने हुए जानवर के लिए प्रजनन रिकॉर्ड नहीं है।")}
          </Text>
        ) : (
          events.map((row) => {
            const rowNextAction = resolveNextAction(row, date);
            return (
              <View
                key={row.breedingEventId}
                style={{
                  marginTop: 10,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  borderRadius: 10,
                  backgroundColor: DairyColors.surfaceMuted,
                  padding: 10,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                  {x("Heat", "हीट")}: {row.heatDate}
                </Text>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x("Insemination", "इंसेमिनेशन")}: {row.inseminationDate || "-"}
                </Text>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x("Pregnancy", "गर्भावस्था")}: {pregnancyLabel(row.pregnancyResult)}
                </Text>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x("Expected Calving", "अपेक्षित बछड़ा")}: {row.expectedCalvingDate || "-"}
                </Text>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x("Actual Calving", "वास्तविक बछड़ा")}: {row.actualCalvingDate || "-"}
                </Text>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x("Calf", "बछड़ा")}: {row.calfTag || row.calfAnimalId || "-"} ({calfGenderLabel(row.calfGender)})
                </Text>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x("Outcome", "परिणाम")}: {calvingOutcomeLabel(row.calvingOutcome)}
                </Text>
                <Text style={{ marginTop: 4, color: DairyColors.primary, fontWeight: "700" }}>
                  {x("Next step", "अगला कदम")}: {nextActionLabel(rowNextAction.code)}
                  {rowNextAction.recommendedDate
                    ? x(` (${rowNextAction.recommendedDate})`, ` (${rowNextAction.recommendedDate})`)
                    : ""}
                </Text>
                {row.notes ? (
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                    {x("Notes", "नोट्स")}: {row.notes}
                  </Text>
                ) : null}

                {canManageBreeding ? (
                  <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
                    <Pressable
                      onPress={() => onEdit(row)}
                      style={{
                        borderWidth: 1,
                        borderColor: DairyColors.border,
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        backgroundColor: DairyColors.surface,
                      }}
                    >
                      <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                        {x("Edit", "बदलें")}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => onDelete(row)}
                      style={{
                        borderWidth: 1,
                        borderColor: DairyColors.danger,
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        backgroundColor: DairyColors.dangerSoft,
                      }}
                    >
                      <Text style={{ color: DairyColors.danger, fontWeight: "700" }}>
                        {x("Delete", "हटाएं")}
                      </Text>
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
