import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import {
  AnimalApi,
  AnimalResponse,
  FeedApi,
  FeedLogResponse,
  HealthApi,
  MedicalTreatmentResponse,
  MilkEntryApi,
  MilkEntryResponse,
  TreatmentApi,
  VaccinationResponse,
  DewormingResponse,
} from "../../services/api";
import { DairyColors } from "../../constants/dairy-theme";
import { shiftIsoDate, todayLocalISO } from "../../utils/date";
import { useI18n } from "../../state/i18n";

const liters = (value: number) => `${value.toFixed(2)} L`;
const kg = (value: number) => `${value.toFixed(2)} kg`;

function normalizeRef(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function statusTone(status?: AnimalResponse["status"]) {
  if (status === "LACTATING") return { text: DairyColors.success, background: DairyColors.successSoft };
  if (status === "DRY") return { text: DairyColors.warning, background: DairyColors.warningSoft };
  if (status === "SICK") return { text: DairyColors.danger, background: DairyColors.dangerSoft };
  return { text: DairyColors.info, background: DairyColors.infoSoft };
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
  const [allAnimals, setAllAnimals] = useState<AnimalResponse[]>([]);
  const [showAllMilkHistory, setShowAllMilkHistory] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!resolvedAnimalId) {
      return;
    }

    try {
      setLoading(true);
      const fromDate = shiftIsoDate(today, -30);
      // Load primary animal profile first so the details page still works
      // when optional sections (milk/feed/health) are unavailable.
      const animalRes = await AnimalApi.get(resolvedAnimalId);
      setAnimal(animalRes);

      const [animalsRes, milkRes, feedRes, vaccRes, dewormRes, treatmentRes] = await Promise.allSettled([
        AnimalApi.list(),
        MilkEntryApi.historyByAnimal(resolvedAnimalId, fromDate, today),
        FeedApi.list({ date: today, animalId: resolvedAnimalId }),
        HealthApi.listVaccinations(resolvedAnimalId),
        HealthApi.listDeworming(resolvedAnimalId),
        TreatmentApi.list(resolvedAnimalId),
      ]);

      setAllAnimals(animalsRes.status === "fulfilled" ? animalsRes.value : []);
      setMilkHistory(milkRes.status === "fulfilled" ? milkRes.value : []);
      setTodayFeedLogs(feedRes.status === "fulfilled" ? feedRes.value : []);
      setVaccinations(vaccRes.status === "fulfilled" ? vaccRes.value : []);
      setDeworming(dewormRes.status === "fulfilled" ? dewormRes.value : []);
      setTreatments(treatmentRes.status === "fulfilled" ? treatmentRes.value : []);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load animal details.", "जानवर का विवरण लोड नहीं हो पाया।")
      );
    } finally {
      setLoading(false);
    }
  }, [resolvedAnimalId, today, x]);

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
      vaccSoon: vaccinations.filter((v) => isSoon(v.nextDueDate)).length,
      vaccOverdue: vaccinations.filter((v) => isOverdue(v.nextDueDate)).length,
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

  const resolveAnimalRef = useCallback(
    (reference?: string | null) => {
      const needle = normalizeRef(reference);
      if (!needle) {
        return null;
      }
      return (
        allAnimals.find((row) => normalizeRef(row.animalId) === needle) ??
        allAnimals.find((row) => normalizeRef(row.tag) === needle) ??
        null
      );
    },
    [allAnimals]
  );

  const motherAnimal = useMemo(
    () => resolveAnimalRef(animal?.motherAnimalId),
    [animal?.motherAnimalId, resolveAnimalRef]
  );
  const sireAnimal = useMemo(
    () => resolveAnimalRef(animal?.sireTag),
    [animal?.sireTag, resolveAnimalRef]
  );

  const tone = statusTone(animal?.status);

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
