import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import {
  AnimalApi,
  AnimalResponse,
  ExpenseApi,
  FeedApi,
  FeedLogResponse,
  HealthApi,
  MedicalTreatmentResponse,
  SalesApi,
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
const money = (value: number) => `Rs ${value.toFixed(2)}`;

type AnimalProfitabilityEstimate = {
  fromDate: string;
  toDate: string;
  avgMilkPrice: number;
  animalMilkLiters: number;
  animalFeedKg: number;
  animalTreatmentCount: number;
  estimatedRevenue: number;
  estimatedFeedCost: number;
  estimatedTreatmentCost: number;
  estimatedTotalCost: number;
  estimatedNet: number;
  roiPercent: number | null;
  feedCostPerKg: number;
  treatmentCostPerCase: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  warnings: string[];
};

function normalizeRef(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function inIsoRange(value: string, fromDate: string, toDate: string) {
  return value >= fromDate && value <= toDate;
}

function statusTone(status?: AnimalResponse["status"]) {
  if (status === "LACTATING") return { text: DairyColors.success, background: DairyColors.successSoft };
  if (status === "DRY") return { text: DairyColors.warning, background: DairyColors.warningSoft };
  if (status === "SICK") return { text: DairyColors.danger, background: DairyColors.dangerSoft };
  return { text: DairyColors.info, background: DairyColors.infoSoft };
}

function confidenceTone(level: AnimalProfitabilityEstimate["confidence"]) {
  if (level === "HIGH") {
    return { text: DairyColors.success, background: DairyColors.successSoft };
  }
  if (level === "MEDIUM") {
    return { text: DairyColors.warning, background: DairyColors.warningSoft };
  }
  return { text: DairyColors.danger, background: DairyColors.dangerSoft };
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
  const [profitabilityLoading, setProfitabilityLoading] = useState(false);
  const [profitability, setProfitability] = useState<AnimalProfitabilityEstimate | null>(null);

  const loadProfitability = useCallback(
    async (prefetched?: { herdAnimals?: AnimalResponse[]; animalMilkRows?: MilkEntryResponse[] }) => {
      if (!resolvedAnimalId) {
        return;
      }
      const fromDate = shiftIsoDate(today, -29);
      try {
        setProfitabilityLoading(true);
        const [salesRows, expenseRows, feedRows, herdAnimals] = await Promise.all([
          SalesApi.list(),
          ExpenseApi.list(),
          FeedApi.list(),
          prefetched?.herdAnimals ? Promise.resolve(prefetched.herdAnimals) : AnimalApi.list(),
        ]);

        const milkRows =
          prefetched?.animalMilkRows ??
          (await MilkEntryApi.historyByAnimal(resolvedAnimalId, fromDate, today));
        const milkRowsInRange = milkRows.filter((row) => inIsoRange(row.date, fromDate, today));
        const animalMilkLiters = milkRowsInRange.reduce((sum, row) => sum + row.liters, 0);

        const milkSalesInRange = salesRows.filter(
          (row) =>
            row.productType === "MILK" &&
            inIsoRange(row.dispatchDate, fromDate, today) &&
            Number.isFinite(row.quantity) &&
            row.quantity > 0
        );
        const soldMilkQty = milkSalesInRange.reduce((sum, row) => sum + row.quantity, 0);
        const soldMilkRevenue = milkSalesInRange.reduce((sum, row) => sum + row.totalAmount, 0);
        const avgMilkPrice = soldMilkQty > 0 ? soldMilkRevenue / soldMilkQty : 0;

        const expenseInRange = expenseRows.filter((row) => inIsoRange(row.expenseDate, fromDate, today));
        const feedExpenseTotal = expenseInRange
          .filter((row) => row.category === "FEED")
          .reduce((sum, row) => sum + row.amount, 0);
        const vetExpenseTotal = expenseInRange
          .filter((row) => row.category === "VETERINARY")
          .reduce((sum, row) => sum + row.amount, 0);

        const feedRowsInRange = feedRows.filter((row) => inIsoRange(row.feedDate, fromDate, today));
        const totalFeedKg = feedRowsInRange.reduce((sum, row) => sum + row.quantityKg, 0);
        const animalFeedKg = feedRowsInRange
          .filter((row) => row.animalId === resolvedAnimalId)
          .reduce((sum, row) => sum + row.quantityKg, 0);
        const feedCostPerKg = totalFeedKg > 0 ? feedExpenseTotal / totalFeedKg : 0;
        const estimatedFeedCost = animalFeedKg * feedCostPerKg;

        const treatmentCountsByAnimal = await Promise.all(
          herdAnimals.map(async (row) => {
            try {
              const list = await TreatmentApi.list(row.animalId);
              return {
                animalId: row.animalId,
                count: list.filter((item) => inIsoRange(item.treatmentDate, fromDate, today)).length,
              };
            } catch {
              return { animalId: row.animalId, count: 0 };
            }
          })
        );

        const totalTreatmentCount = treatmentCountsByAnimal.reduce((sum, row) => sum + row.count, 0);
        const animalTreatmentCount =
          treatmentCountsByAnimal.find((row) => row.animalId === resolvedAnimalId)?.count ?? 0;
        const treatmentCostPerCase = totalTreatmentCount > 0 ? vetExpenseTotal / totalTreatmentCount : 0;
        const estimatedTreatmentCost = animalTreatmentCount * treatmentCostPerCase;

        const estimatedRevenue = animalMilkLiters * avgMilkPrice;
        const estimatedTotalCost = estimatedFeedCost + estimatedTreatmentCost;
        const estimatedNet = estimatedRevenue - estimatedTotalCost;
        const roiPercent =
          estimatedTotalCost > 0 ? (estimatedNet / estimatedTotalCost) * 100 : estimatedRevenue > 0 ? 100 : null;

        const warnings: string[] = [];
        if (soldMilkQty <= 0) {
          warnings.push(
            x(
              "No milk sale records found in this window; revenue estimate may be low.",
              "इस अवधि में दूध बिक्री रिकॉर्ड नहीं मिला; आय का अनुमान कम हो सकता है।"
            )
          );
        }
        if (totalFeedKg <= 0 && feedExpenseTotal > 0) {
          warnings.push(
            x(
              "Feed expense exists but feed quantity logs are missing.",
              "फीड खर्च है लेकिन फीड मात्रा लॉग उपलब्ध नहीं हैं।"
            )
          );
        }
        if (totalTreatmentCount <= 0 && vetExpenseTotal > 0) {
          warnings.push(
            x(
              "Veterinary expense exists but treatment records are missing.",
              "वेट खर्च है लेकिन ट्रीटमेंट रिकॉर्ड उपलब्ध नहीं हैं।"
            )
          );
        }

        const confidence: AnimalProfitabilityEstimate["confidence"] =
          soldMilkQty > 0 && totalFeedKg > 0 && totalTreatmentCount > 0
            ? "HIGH"
            : soldMilkQty > 0 && (totalFeedKg > 0 || totalTreatmentCount > 0)
              ? "MEDIUM"
              : "LOW";

        setProfitability({
          fromDate,
          toDate: today,
          avgMilkPrice,
          animalMilkLiters,
          animalFeedKg,
          animalTreatmentCount,
          estimatedRevenue,
          estimatedFeedCost,
          estimatedTreatmentCost,
          estimatedTotalCost,
          estimatedNet,
          roiPercent,
          feedCostPerKg,
          treatmentCostPerCase,
          confidence,
          warnings,
        });
      } catch (e) {
        console.error(e);
        setProfitability(null);
      } finally {
        setProfitabilityLoading(false);
      }
    },
    [resolvedAnimalId, today, x]
  );

  const loadData = useCallback(async () => {
    if (!resolvedAnimalId) {
      return;
    }

    try {
      setLoading(true);
      const fromDate = shiftIsoDate(today, -29);
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

      const herdAnimals = animalsRes.status === "fulfilled" ? animalsRes.value : [];
      const animalMilkRows = milkRes.status === "fulfilled" ? milkRes.value : [];
      setAllAnimals(herdAnimals);
      setMilkHistory(animalMilkRows);
      setTodayFeedLogs(feedRes.status === "fulfilled" ? feedRes.value : []);
      setVaccinations(vaccRes.status === "fulfilled" ? vaccRes.value : []);
      setDeworming(dewormRes.status === "fulfilled" ? dewormRes.value : []);
      setTreatments(treatmentRes.status === "fulfilled" ? treatmentRes.value : []);
      void loadProfitability({ herdAnimals, animalMilkRows });
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
    if (profitability.estimatedNet < 0 && milkSummary.avgPerDay < 5) {
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
    if (profitability.estimatedNet > 0 && milkSummary.avgPerDay >= 8) {
      return x(
        "Healthy contribution. Keep current plan and monitor for stability.",
        "अच्छा योगदान दिख रहा है। वर्तमान योजना जारी रखें और स्थिरता मॉनिटर करें।"
      );
    }
    return x(
      "Contribution is positive but moderate. Track for 2-4 more weeks before major decisions.",
      "योगदान सकारात्मक है लेकिन मध्यम है। बड़े निर्णय से पहले 2-4 सप्ताह और ट्रैक करें।"
    );
  }, [animal?.status, milkSummary.avgPerDay, profitability, x]);

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
