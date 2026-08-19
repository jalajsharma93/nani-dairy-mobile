import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import {
  AnimalApi,
  AnimalResponse,
  AnimalLifecycleEventResponse,
  FeedApi,
  FeedLogResponse,
  HealthApi,
  MedicalTreatmentResponse,
  ReportApi,
  AnimalProfitabilityResponse,
  MilkEntryApi,
  MilkEntryResponse,
  TreatmentApi,
  VaccinationResponse,
  DewormingResponse,
} from "@/src/services/api";
import { DairyColors } from "@/src/constants/dairy-theme";
import { shiftIsoDate, todayLocalISO } from "@/src/utils/date";
import { useI18n } from "@/src/state/i18n";

const liters = (value: number) => `${value.toFixed(2)} L`;
const kg = (value: number) => `${value.toFixed(2)} kg`;
const money = (value: number) => `Rs ${value.toFixed(2)}`;

function normalizeRef(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function statusTone(status?: AnimalResponse["status"]) {
  if (status === "LACTATING") return { text: DairyColors.success, background: DairyColors.successSoft };
  if (status === "DRY") return { text: DairyColors.warning, background: DairyColors.warningSoft };
  if (status === "SICK") return { text: DairyColors.danger, background: DairyColors.dangerSoft };
  if (status === "RETIRED") return { text: DairyColors.textSecondary, background: DairyColors.surfaceMuted };
  if (status === "DEAD") return { text: "#6B7280", background: "#E5E7EB" };
  return { text: DairyColors.info, background: DairyColors.infoSoft };
}

function confidenceTone(level: AnimalProfitabilityResponse["confidence"]) {
  if (level === "HIGH") {
    return { text: DairyColors.success, background: DairyColors.successSoft };
  }
  if (level === "MEDIUM") {
    return { text: DairyColors.warning, background: DairyColors.warningSoft };
  }
  return { text: DairyColors.danger, background: DairyColors.dangerSoft };
}

function resolvedVaccinationNextDueDate(row: Pick<VaccinationResponse, "vaccineName" | "doseDate" | "nextDueDate">) {
  if (row.nextDueDate) {
    return row.nextDueDate;
  }
  const vaccine = normalizeRef(row.vaccineName);
  if (!row.doseDate) {
    return null;
  }
  if (vaccine === "fmd") {
    return shiftIsoDate(row.doseDate, 180);
  }
  if (vaccine === "hs" || vaccine === "bq" || vaccine === "anthrax" || vaccine === "lsd") {
    return shiftIsoDate(row.doseDate, 365);
  }
  return null;
}

export default function AnimalDetailsScreen() {
  const router = useRouter();
  const { animalId } = useLocalSearchParams<{ animalId?: string }>();
  const { x, label } = useI18n();
  const today = todayLocalISO();

  const resolvedAnimalId = useMemo(
    () => (Array.isArray(animalId) ? animalId[0] : animalId) ?? "",
    [animalId]
  );

  const [animal, setAnimal] = useState<AnimalResponse | null>(null);
  const [milkHistory, setMilkHistory] = useState<MilkEntryResponse[]>([]);
  const [todayFeedLogs, setTodayFeedLogs] = useState<FeedLogResponse[]>([]);
  const [vaccinations, setVaccinations] = useState<VaccinationResponse[]>([]);
  const [deworming, setDeworming] = useState<DewormingResponse[]>([]);
  const [treatments, setTreatments] = useState<MedicalTreatmentResponse[]>([]);
  const [motherAnimal, setMotherAnimal] = useState<AnimalResponse | null>(null);
  const [sireAnimal, setSireAnimal] = useState<AnimalResponse | null>(null);
  const [offspring, setOffspring] = useState<AnimalResponse[]>([]);
  const [offspringCount, setOffspringCount] = useState(0);
  const [activeOffspringCount, setActiveOffspringCount] = useState(0);
  const [lifecycleHistory, setLifecycleHistory] = useState<AnimalLifecycleEventResponse[]>([]);
  const [showAllMilkHistory, setShowAllMilkHistory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profitabilityLoading, setProfitabilityLoading] = useState(false);
  const [profitability, setProfitability] = useState<AnimalProfitabilityResponse | null>(null);

  const loadProfitability = useCallback(async () => {
    if (!resolvedAnimalId) {
      return;
    }
    try {
      setProfitabilityLoading(true);
      const analytics = await ReportApi.animalProfitability(resolvedAnimalId, today, 30);
      setProfitability(analytics);
    } catch (e) {
      console.error(e);
      setProfitability(null);
    } finally {
      setProfitabilityLoading(false);
    }
  }, [resolvedAnimalId, today]);

  const loadData = useCallback(async () => {
    if (!resolvedAnimalId) {
      return;
    }

    try {
      setLoading(true);
      const fromDate = shiftIsoDate(today, -29);
      const genealogy = await AnimalApi.genealogy(resolvedAnimalId);
      setAnimal(genealogy.animal);
      setMotherAnimal(genealogy.mother ?? null);
      setSireAnimal(genealogy.sire ?? null);
      setOffspring(genealogy.offspring ?? []);
      setOffspringCount(genealogy.offspringCount ?? 0);
      setActiveOffspringCount(genealogy.activeOffspringCount ?? 0);

      const [milkRes, feedRes, vaccRes, dewormRes, treatmentRes, lifecycleRes] = await Promise.allSettled([
        MilkEntryApi.historyByAnimal(resolvedAnimalId, fromDate, today),
        FeedApi.list({ date: today, animalId: resolvedAnimalId }),
        HealthApi.listVaccinations(resolvedAnimalId),
        HealthApi.listDeworming(resolvedAnimalId),
        TreatmentApi.list(resolvedAnimalId),
        AnimalApi.lifecycleHistory(resolvedAnimalId),
      ]);

      const animalMilkRows = milkRes.status === "fulfilled" ? milkRes.value : [];
      setMilkHistory(animalMilkRows);
      setTodayFeedLogs(feedRes.status === "fulfilled" ? feedRes.value : []);
      setVaccinations(vaccRes.status === "fulfilled" ? vaccRes.value : []);
      setDeworming(dewormRes.status === "fulfilled" ? dewormRes.value : []);
      setTreatments(treatmentRes.status === "fulfilled" ? treatmentRes.value : []);
      setLifecycleHistory(lifecycleRes.status === "fulfilled" ? lifecycleRes.value : []);
      void loadProfitability();
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load animal details.", "जानवर का विवरण लोड नहीं हो पाया।")
      );
    } finally {
      setLoading(false);
    }
  }, [loadProfitability, resolvedAnimalId, today, x]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const milkSummary = useMemo(() => {
    const total = milkHistory.reduce((sum, item) => sum + item.liters, 0);
    const uniqueDays = new Set(milkHistory.map((m) => m.date)).size;
    const avgPerDay = uniqueDays > 0 ? total / uniqueDays : 0;
    const passCount = milkHistory.filter((m) => m.qcStatus === "PASS").length;
    return {
      total,
      entries: milkHistory.length,
      avgPerDay,
      passRate: milkHistory.length > 0 ? passCount / milkHistory.length : 0,
    };
  }, [milkHistory]);

  const todayFeedKg = useMemo(
    () => todayFeedLogs.reduce((sum, log) => sum + log.quantityKg, 0),
    [todayFeedLogs]
  );

  const healthSummary = useMemo(() => {
    const soonDate = shiftIsoDate(today, 7);
    const isSoon = (d?: string | null) => !!d && d >= today && d <= soonDate;
    const isOverdue = (d?: string | null) => !!d && d < today;

    return {
      vaccSoon: vaccinations.filter((v) => isSoon(resolvedVaccinationNextDueDate(v))).length,
      vaccOverdue: vaccinations.filter((v) => isOverdue(resolvedVaccinationNextDueDate(v))).length,
      dewormSoon: deworming.filter((d) => isSoon(d.nextDueDate)).length,
      dewormOverdue: deworming.filter((d) => isOverdue(d.nextDueDate)).length,
      treatmentFollowUpSoon: treatments.filter((row) => isSoon(row.followUpDate)).length,
      treatmentFollowUpOverdue: treatments.filter((row) => isOverdue(row.followUpDate)).length,
    };
  }, [deworming, today, treatments, vaccinations]);

  const recentMilk = useMemo(
    () =>
      [...milkHistory]
        .sort((a, b) => (a.date === b.date ? (a.shift > b.shift ? -1 : 1) : a.date > b.date ? -1 : 1))
        .slice(0, showAllMilkHistory ? 200 : 6),
    [milkHistory, showAllMilkHistory]
  );

  const profitabilityRecommendation = useMemo(() => {
    if (!profitability) {
      return x(
        "Add more milk/feed/sales data for better profitability guidance.",
        "बेहतर लाभ विश्लेषण के लिए दूध/फीड/बिक्री का और डेटा जोड़ें।"
      );
    }
    if (animal?.status !== "LACTATING") {
      return x(
        "This estimate is most useful for lactating animals; use as reference for lifecycle cost.",
        "यह अनुमान दुग्ध देने वाले जानवरों के लिए सबसे उपयोगी है; इसे जीवनचक्र लागत संदर्भ की तरह देखें।"
      );
    }
    if (profitability.cullingReviewSuggested || (profitability.estimatedNet < 0 && profitability.avgMilkPerDay < 5)) {
      return x(
        "Negative contribution with low yield. Review ration and consider culling decision if trend continues.",
        "कम उत्पादन के साथ नुकसान दिख रहा है। राशन समीक्षा करें और ट्रेंड जारी रहे तो culling निर्णय पर विचार करें।"
      );
    }
    if (profitability.estimatedNet < 0) {
      return x(
        "Negative contribution. Review feed plan, health issues, and milk quality to improve margin.",
        "नुकसान दिख रहा है। मार्जिन सुधारने के लिए फीड प्लान, स्वास्थ्य और दूध गुणवत्ता की समीक्षा करें।"
      );
    }
    if (profitability.estimatedNet > 0 && profitability.avgMilkPerDay >= 8) {
      return x(
        "Healthy contribution. Keep current plan and monitor for stability.",
        "अच्छा योगदान दिख रहा है। वर्तमान योजना जारी रखें और स्थिरता मॉनिटर करें।"
      );
    }
    return x(
      "Contribution is positive but moderate. Track for 2-4 more weeks before major decisions.",
      "योगदान सकारात्मक है लेकिन मध्यम है। बड़े निर्णय से पहले 2-4 सप्ताह और ट्रैक करें।"
    );
  }, [animal?.status, profitability, x]);
  const offspringPreview = useMemo(() => offspring.slice(0, 8), [offspring]);
  const lifecyclePreview = useMemo(() => lifecycleHistory.slice(0, 10), [lifecycleHistory]);
  const lineageQuality = useMemo(() => {
    const notes: { tone: "success" | "warning" | "danger"; textEn: string; textHi: string }[] = [];

    if (!animal?.motherAnimalId && !animal?.sireTag) {
      notes.push({
        tone: "warning",
        textEn: "Parentage is incomplete. Add mother and sire/bull references when known.",
        textHi: "माता-पिता जानकारी अधूरी है। जानकारी हो तो मां और सायर/बैल रेफरेंस जोड़ें।",
      });
    } else if (!animal?.motherAnimalId || !animal?.sireTag) {
      notes.push({
        tone: "warning",
        textEn: "One parent reference is missing. Complete lineage improves genealogy reports.",
        textHi: "एक parent रेफरेंस अधूरा है। पूरी lineage से genealogy रिपोर्ट बेहतर होती है।",
      });
    } else {
      notes.push({
        tone: "success",
        textEn: "Parentage is complete for this animal.",
        textHi: "इस जानवर की parentage पूरी है।",
      });
    }

    if ((animal?.status === "SOLD" || animal?.status === "DEAD") && animal.isActive) {
      notes.push({
        tone: "danger",
        textEn: "Terminal lifecycle status should be inactive.",
        textHi: "अंतिम lifecycle status में animal inactive होना चाहिए।",
      });
    }

    if (lifecycleHistory.length === 0) {
      notes.push({
        tone: "warning",
        textEn: "No lifecycle transition audit has been recorded yet.",
        textHi: "अभी कोई lifecycle transition audit रिकॉर्ड नहीं है।",
      });
    }

    return notes;
  }, [animal, lifecycleHistory.length]);

  const tone = statusTone(animal?.status);
  const profitabilityConfidenceTone = profitability ? confidenceTone(profitability.confidence) : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: DairyColors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Pressable
          onPress={() => router.back()}
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
          <Ionicons name="arrow-back" size={18} color={DairyColors.textPrimary} />
        </Pressable>
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
          <Ionicons name={loading ? "sync-circle" : "refresh"} size={18} color={DairyColors.primary} />
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
          {x("Lifecycle History", "लाइफसाइकिल हिस्ट्री")}
        </Text>
        {lifecyclePreview.length === 0 ? (
          <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
            {x("No lifecycle transitions recorded yet.", "अभी लाइफसाइकिल ट्रांजिशन रिकॉर्ड नहीं हैं।")}
          </Text>
        ) : (
          lifecyclePreview.map((row) => (
            <View
              key={row.animalLifecycleEventId}
              style={{
                marginTop: 8,
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 10,
                backgroundColor: DairyColors.surfaceMuted,
                padding: 10,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                {x(
                  `${row.fromStatus ?? "NEW"} -> ${row.toStatus} | ${row.fromActive == null ? "-" : row.fromActive ? "Active" : "Inactive"} -> ${row.toActive ? "Active" : "Inactive"}`,
                  `${row.fromStatus ?? "NEW"} -> ${row.toStatus} | ${row.fromActive == null ? "-" : row.fromActive ? "सक्रिय" : "निष्क्रिय"} -> ${row.toActive ? "सक्रिय" : "निष्क्रिय"}`
                )}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x(
                  `By ${row.changedBy ?? "unknown"} on ${row.changedAt ? row.changedAt.replace("T", " ").slice(0, 16) : "-"}`,
                  `${row.changedBy ?? "unknown"} द्वारा ${row.changedAt ? row.changedAt.replace("T", " ").slice(0, 16) : "-"}`
                )}
              </Text>
              {row.reason ? (
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x(`Reason: ${row.reason}`, `कारण: ${row.reason}`)}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </View>

      <View
        style={{
          marginTop: 12,
          borderWidth: 1,
          borderColor: DairyColors.border,
          borderRadius: 14,
          backgroundColor: DairyColors.surface,
          padding: 14,
        }}
      >
        <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
          {(animal?.name && animal.name.trim()) || animal?.tag || x("Animal", "जानवर")}
        </Text>
        <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
          {x("Animal Profile", "जानवर प्रोफाइल")}
        </Text>

        <View
          style={{
            marginTop: 10,
            alignSelf: "flex-start",
            borderRadius: 999,
            backgroundColor: tone.background,
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}
        >
          <Text style={{ color: tone.text, fontWeight: "700" }}>
            {animal?.status ? label("animalStatus", animal.status) : x("Unknown", "अज्ञात")}
          </Text>
        </View>

        <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
          {x("Tag ID", "टैग आईडी")}: {animal?.tag || "-"}
        </Text>
        <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
          {x("Breed", "नस्ल")}: {animal?.breed ? label("breed", animal.breed) : "-"}
        </Text>
        {animal?.animalId ? (
          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
            {x("Animal ID", "जानवर आईडी")}: {animal.animalId}
          </Text>
        ) : (
          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
            {x(
              "Animal record not found for this ID.",
              "इस आईडी के लिए जानवर का रिकॉर्ड नहीं मिला।"
            )}
          </Text>
        )}
        <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
          {x("Active", "सक्रिय")}: {animal?.isActive ? x("Yes", "हाँ") : x("No", "नहीं")}
        </Text>

        <Text style={{ marginTop: 10, color: DairyColors.textPrimary, fontWeight: "800" }}>
          {x("Parentage", "माता-पिता जानकारी")}
        </Text>
        <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
          {x("Mother", "मां")}: {motherAnimal?.tag || animal?.motherAnimalId || "-"}
        </Text>
        <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
          {x("Sire/Bull", "बैल/सायर")}: {sireAnimal?.tag || animal?.sireTag || "-"}
        </Text>

        {motherAnimal?.animalId ? (
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/animals/[animalId]",
                params: { animalId: motherAnimal.animalId },
              })
            }
            style={{
              marginTop: 10,
              alignSelf: "flex-start",
              borderRadius: 10,
              borderWidth: 1,
              borderColor: DairyColors.border,
              backgroundColor: DairyColors.surfaceMuted,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
              {x("View Mother Profile", "मां की प्रोफाइल देखें")}
            </Text>
          </Pressable>
        ) : null}

        {sireAnimal?.animalId ? (
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/animals/[animalId]",
                params: { animalId: sireAnimal.animalId },
              })
            }
            style={{
              marginTop: 8,
              alignSelf: "flex-start",
              borderRadius: 10,
              borderWidth: 1,
              borderColor: DairyColors.border,
              backgroundColor: DairyColors.surfaceMuted,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
              {x("View Sire Profile", "सायर की प्रोफाइल देखें")}
            </Text>
          </Pressable>
        ) : null}

        <Text style={{ marginTop: 12, color: DairyColors.textPrimary, fontWeight: "800" }}>
          {x("Offspring", "संतान")}
        </Text>
        <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
          {x(
            `${offspringCount} total | ${activeOffspringCount} active`,
            `${offspringCount} कुल | ${activeOffspringCount} सक्रिय`
          )}
        </Text>
        {offspringPreview.length === 0 ? (
          <Text style={{ marginTop: 6, color: DairyColors.textSecondary }}>
            {x("No offspring records linked yet.", "अभी संतान रिकॉर्ड लिंक नहीं हैं।")}
          </Text>
        ) : (
          <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {offspringPreview.map((child) => (
              <Pressable
                key={child.animalId}
                onPress={() =>
                  router.push({
                    pathname: "/animals/[animalId]",
                    params: { animalId: child.animalId },
                  })
                }
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  backgroundColor: DairyColors.surfaceMuted,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                  {child.tag}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <View
          style={{
            marginTop: 12,
            borderWidth: 1,
            borderColor: DairyColors.border,
            borderRadius: 10,
            backgroundColor: DairyColors.surfaceMuted,
            padding: 10,
          }}
        >
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
            {x("Lineage Quality", "Lineage गुणवत्ता")}
          </Text>
          {lineageQuality.map((note) => {
            const noteColor =
              note.tone === "success"
                ? DairyColors.success
                : note.tone === "danger"
                  ? DairyColors.danger
                  : DairyColors.warning;
            return (
              <View
                key={note.textEn}
                style={{ marginTop: 7, flexDirection: "row", alignItems: "flex-start", gap: 6 }}
              >
                <Ionicons
                  name={note.tone === "success" ? "checkmark-circle" : "alert-circle"}
                  size={16}
                  color={noteColor}
                  style={{ marginTop: 1 }}
                />
                <Text style={{ flex: 1, color: DairyColors.textSecondary }}>
                  {x(note.textEn, note.textHi)}
                </Text>
              </View>
            );
          })}
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
          gap: 8,
        }}
      >
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
          {x("Animal Activities", "जानवर गतिविधियां")}
        </Text>
        <Text style={{ color: DairyColors.textSecondary }}>
          {x(
            "Open per-animal screens to add/update insemination, vaccination and treatment records.",
            "इंसेमिनेशन, टीका और ट्रीटमेंट रिकॉर्ड जोड़ने/अपडेट करने के लिए नीचे से स्क्रीन खोलें।"
          )}
        </Text>

        <View style={{ marginTop: 2, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/breeding",
                params: { animalId: resolvedAnimalId, tag: animal?.tag ?? "" },
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
              {x("Insemination/Breeding", "इंसेमिनेशन/प्रजनन")}
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              router.push({
                pathname: "/health",
                params: { animalId: resolvedAnimalId, tag: animal?.tag ?? "" },
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
              {x("Vaccination/Deworming", "टीका/पेट दवा")}
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              router.push({
                pathname: "/treatments",
                params: { animalId: resolvedAnimalId, tag: animal?.tag ?? "" },
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
        <View style={{ flex: 1, minWidth: 130, borderRadius: 12, backgroundColor: DairyColors.accentSoft, padding: 10 }}>
          <Text style={{ color: DairyColors.textSecondary }}>{x("Milk (30 days)", "दूध (30 दिन)")}</Text>
          <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontSize: 18, fontWeight: "800" }}>
            {liters(milkSummary.total)}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 130, borderRadius: 12, backgroundColor: DairyColors.successSoft, padding: 10 }}>
          <Text style={{ color: DairyColors.textSecondary }}>{x("Avg/Day", "औसत/दिन")}</Text>
          <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontSize: 18, fontWeight: "800" }}>
            {liters(milkSummary.avgPerDay)}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 130, borderRadius: 12, backgroundColor: DairyColors.infoSoft, padding: 10 }}>
          <Text style={{ color: DairyColors.textSecondary }}>{x("Today's Feed", "आज का चारा")}</Text>
          <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontSize: 18, fontWeight: "800" }}>
            {kg(todayFeedKg)}
          </Text>
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
          {x("Profitability (30 days estimate)", "लाभ विश्लेषण (30 दिन अनुमान)")}
        </Text>
        <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
          {profitability
            ? x(
                `${profitability.fromDate} to ${profitability.toDate}`,
                `${profitability.fromDate} से ${profitability.toDate}`
              )
            : x("Based on sales, feed, expense and treatment records.", "बिक्री, फीड, खर्च और ट्रीटमेंट रिकॉर्ड पर आधारित।")}
        </Text>

        {profitabilityLoading ? (
          <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
            {x("Calculating estimate...", "अनुमान निकाला जा रहा है...")}
          </Text>
        ) : profitability ? (
          <>
            <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <View style={{ flex: 1, minWidth: 110, borderRadius: 10, backgroundColor: DairyColors.successSoft, padding: 9 }}>
                <Text style={{ color: DairyColors.textSecondary }}>{x("Revenue", "आय")}</Text>
                <Text style={{ marginTop: 3, color: DairyColors.textPrimary, fontWeight: "800" }}>
                  {money(profitability.estimatedRevenue)}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 110, borderRadius: 10, backgroundColor: DairyColors.warningSoft, padding: 9 }}>
                <Text style={{ color: DairyColors.textSecondary }}>{x("Cost", "लागत")}</Text>
                <Text style={{ marginTop: 3, color: DairyColors.textPrimary, fontWeight: "800" }}>
                  {money(profitability.estimatedTotalCost)}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  minWidth: 110,
                  borderRadius: 10,
                  backgroundColor: profitability.estimatedNet >= 0 ? DairyColors.successSoft : DairyColors.dangerSoft,
                  padding: 9,
                }}
              >
                <Text style={{ color: DairyColors.textSecondary }}>{x("Net", "शुद्ध")}</Text>
                <Text style={{ marginTop: 3, color: DairyColors.textPrimary, fontWeight: "800" }}>
                  {money(profitability.estimatedNet)}
                </Text>
              </View>
            </View>

            <View
              style={{
                marginTop: 10,
                alignSelf: "flex-start",
                borderRadius: 999,
                backgroundColor: profitabilityConfidenceTone?.background ?? DairyColors.surfaceMuted,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: profitabilityConfidenceTone?.text ?? DairyColors.textPrimary, fontWeight: "800" }}>
                {x(
                  `Confidence: ${profitability.confidence}`,
                  `विश्वास स्तर: ${
                    profitability.confidence === "HIGH"
                      ? "उच्च"
                      : profitability.confidence === "MEDIUM"
                        ? "मध्यम"
                        : "कम"
                  }`
                )}
              </Text>
            </View>

            <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
              {x(
                `Milk ${liters(profitability.animalMilkLiters)} @ ${money(profitability.avgMilkPrice)}/L`,
                `दूध ${liters(profitability.animalMilkLiters)} @ ${money(profitability.avgMilkPrice)}/लीटर`
              )}
            </Text>
            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
              {x(
                `Feed ${kg(profitability.animalFeedKg)} @ ${money(profitability.feedCostPerKg)}/kg = ${money(profitability.estimatedFeedCost)}`,
                `फीड ${kg(profitability.animalFeedKg)} @ ${money(profitability.feedCostPerKg)}/किलो = ${money(profitability.estimatedFeedCost)}`
              )}
            </Text>
            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
              {x(
                `Treatment ${profitability.animalTreatmentCount} case(s) @ ${money(profitability.treatmentCostPerCase)} = ${money(profitability.estimatedTreatmentCost)}`,
                `ट्रीटमेंट ${profitability.animalTreatmentCount} केस @ ${money(profitability.treatmentCostPerCase)} = ${money(profitability.estimatedTreatmentCost)}`
              )}
            </Text>
            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
              {x(
                `Labor ${liters(profitability.animalMilkLiters)} @ ${money(profitability.laborCostPerLiter)}/L = ${money(profitability.estimatedLaborCost)}`,
                `श्रम ${liters(profitability.animalMilkLiters)} @ ${money(profitability.laborCostPerLiter)}/लीटर = ${money(profitability.estimatedLaborCost)}`
              )}
            </Text>
            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
              {x(
                `ROI: ${profitability.roiPercent == null ? "-" : `${profitability.roiPercent.toFixed(1)}%`}`,
                `ROI: ${profitability.roiPercent == null ? "-" : `${profitability.roiPercent.toFixed(1)}%`}`
              )}
            </Text>

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
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                {x("Recommendation", "सुझाव")}
              </Text>
              <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                {profitabilityRecommendation}
              </Text>
            </View>

            {profitability.warnings.length > 0 ? (
              <View style={{ marginTop: 8, gap: 5 }}>
                {profitability.warnings.map((warning, idx) => (
                  <Text key={`${warning}_${idx}`} style={{ color: DairyColors.warning }}>
                    {warning}
                  </Text>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
            {x(
              "Profitability estimate is unavailable right now.",
              "फिलहाल लाभ अनुमान उपलब्ध नहीं है।"
            )}
          </Text>
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
          {x("Health Due Summary", "सेहत देय सारांश")}
        </Text>
        <Text style={{ marginTop: 6, color: DairyColors.textSecondary }}>
          {x("Vaccination due soon", "टीका जल्द देय")}: {healthSummary.vaccSoon}
        </Text>
        <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
          {x("Vaccination overdue", "टीका बाकी")}: {healthSummary.vaccOverdue}
        </Text>
        <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
          {x("Deworming due soon", "पेट दवा जल्द देय")}: {healthSummary.dewormSoon}
        </Text>
        <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
          {x("Deworming overdue", "पेट दवा बाकी")}: {healthSummary.dewormOverdue}
        </Text>
        <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
          {x("Treatment follow-up soon", "ट्रीटमेंट फॉलो-अप जल्द")}: {healthSummary.treatmentFollowUpSoon}
        </Text>
        <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
          {x("Treatment follow-up overdue", "ट्रीटमेंट फॉलो-अप बाकी")}: {healthSummary.treatmentFollowUpOverdue}
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
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
              {x("Milk History", "दूध हिस्ट्री")}
            </Text>
            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
              {x("Last 30 days entries for this animal", "इस जानवर की पिछले 30 दिनों की एंट्री")}
            </Text>
          </View>
          {milkHistory.length > 6 ? (
            <Pressable
              onPress={() => setShowAllMilkHistory((prev) => !prev)}
              style={{
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
                backgroundColor: DairyColors.surfaceMuted,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                {showAllMilkHistory ? x("Show Less", "कम दिखाएं") : x("Show All", "सभी दिखाएं")}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {recentMilk.length === 0 ? (
          <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
            {loading
              ? x("Loading...", "लोड हो रहा है...")
              : x("No milk entries found in selected period.", "चुनी अवधि में दूध एंट्री नहीं मिली।")}
          </Text>
        ) : (
          recentMilk.map((entry) => (
            <View
              key={`${entry.date}_${entry.shift}_${entry.milkEntryId}`}
              style={{
                marginTop: 8,
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 10,
                backgroundColor: DairyColors.surfaceMuted,
                padding: 10,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                {entry.date} | {label("shift", entry.shift)} | {liters(entry.liters)}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x("QC", "क्यूसी")}: {label("qcStatus", entry.qcStatus)}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
