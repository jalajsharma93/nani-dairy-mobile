import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Switch, Text, TextInput, View } from "react-native";
import {
  AnimalApi,
  AnimalGrowthStage,
  HerdProfitabilityResponse,
  AnimalResponse,
  AnimalStatus,
  ReportApi,
} from "@/src/services/api";
import { DairyColors } from "@/src/constants/dairy-theme";
import { useAuth } from "@/src/state/auth";
import { useI18n } from "@/src/state/i18n";
import { todayLocalISO } from "@/src/utils/date";
import { DateInput } from "../../../components/date-input";

const STATUS_OPTIONS: AnimalStatus[] = ["LACTATING", "DRY", "SICK", "SOLD"];
const GROWTH_STAGE_OPTIONS: AnimalGrowthStage[] = ["CALF", "GROWER", "ADULT"];
const BREED_OPTIONS = ["Gir", "Sahiwal", "Desi", "Jersey", "HF", "Buffalo", "Other"] as const;

type Tone = {
  text: string;
  background: string;
};

function statusTone(status: AnimalStatus): Tone {
  if (status === "LACTATING") {
    return { text: DairyColors.success, background: DairyColors.successSoft };
  }
  if (status === "DRY") {
    return { text: DairyColors.warning, background: DairyColors.warningSoft };
  }
  if (status === "SICK") {
    return { text: DairyColors.danger, background: DairyColors.dangerSoft };
  }
  return { text: DairyColors.info, background: DairyColors.infoSoft };
}

export default function AnimalsScreen() {
  const router = useRouter();
  const { hasAnyRole } = useAuth();
  const { x, label } = useI18n();
  const canAddAnimals = hasAnyRole("ADMIN");
  const canEditAnimals = hasAnyRole("ADMIN", "MANAGER");

  const [animals, setAnimals] = useState<AnimalResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profitabilityLoading, setProfitabilityLoading] = useState(false);
  const [herdProfitability, setHerdProfitability] = useState<HerdProfitabilityResponse | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingAnimalId, setEditingAnimalId] = useState<string | null>(null);
  const [lookupTag, setLookupTag] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);

  const [tag, setTag] = useState("");
  const [name, setName] = useState("");
  const [breed, setBreed] = useState<string>(BREED_OPTIONS[0]);
  const [status, setStatus] = useState<AnimalStatus>("LACTATING");
  const [isActive, setIsActive] = useState(true);
  const [motherAnimalId, setMotherAnimalId] = useState("");
  const [sireTag, setSireTag] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [growthStage, setGrowthStage] = useState<AnimalGrowthStage | "">("");
  const [birthWeightKg, setBirthWeightKg] = useState("");
  const [currentWeightKg, setCurrentWeightKg] = useState("");
  const [lastWeightDate, setLastWeightDate] = useState("");
  const [weaningDate, setWeaningDate] = useState("");
  const [weaningWeightKg, setWeaningWeightKg] = useState("");

  const loadHerdProfitability = useCallback(async () => {
    try {
      setProfitabilityLoading(true);
      const report = await ReportApi.herdProfitability({
        toDate: todayLocalISO(),
        days: 30,
        activeOnly: true,
        limit: 50,
      });
      setHerdProfitability(report);
    } catch (e) {
      console.error(e);
      setHerdProfitability(null);
    } finally {
      setProfitabilityLoading(false);
    }
  }, []);

  const loadAnimals = useCallback(async () => {
    try {
      setLoading(true);
      const animalRows = await AnimalApi.list();
      setAnimals(animalRows);
      void loadHerdProfitability();
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load animals.", "जानवरों की जानकारी लोड नहीं हो पाई।")
      );
    } finally {
      setLoading(false);
    }
  }, [loadHerdProfitability, x]);

  useEffect(() => {
    loadAnimals();
  }, [loadAnimals]);

  const resetForm = () => {
    setEditingAnimalId(null);
    setTag("");
    setName("");
    setBreed(BREED_OPTIONS[0]);
    setStatus("LACTATING");
    setIsActive(true);
    setMotherAnimalId("");
    setSireTag("");
    setDateOfBirth("");
    setGrowthStage("");
    setBirthWeightKg("");
    setCurrentWeightKg("");
    setLastWeightDate("");
    setWeaningDate("");
    setWeaningWeightKg("");
    setShowForm(false);
  };

  const openAddForm = () => {
    if (!canAddAnimals) {
      Alert.alert(
        x("Admin only", "सिर्फ एडमिन"),
        x("Only ADMIN users can add animals.", "जानवर जोड़ना सिर्फ ADMIN कर सकता है।")
      );
      return;
    }
    setEditingAnimalId(null);
    setTag("");
    setName("");
    setBreed(BREED_OPTIONS[0]);
    setStatus("LACTATING");
    setIsActive(true);
    setMotherAnimalId("");
    setSireTag("");
    setDateOfBirth("");
    setGrowthStage("");
    setBirthWeightKg("");
    setCurrentWeightKg("");
    setLastWeightDate("");
    setWeaningDate("");
    setWeaningWeightKg("");
    setShowForm(true);
  };

  const submitAnimal = async () => {
    if (editingAnimalId && !canEditAnimals) {
      Alert.alert(
        x("Role restricted", "रोल अनुमति नहीं"),
        x("Only ADMIN or MANAGER users can edit animals.", "जानवर बदलना सिर्फ ADMIN या MANAGER कर सकता है।")
      );
      return;
    }
    if (!editingAnimalId && !canAddAnimals) {
      Alert.alert(
        x("Admin only", "सिर्फ एडमिन"),
        x("Only ADMIN users can add animals.", "जानवर जोड़ना सिर्फ ADMIN कर सकता है।")
      );
      return;
    }

    if (!tag.trim()) {
      Alert.alert(x("Missing details", "जानकारी अधूरी"), x("Tag ID is required.", "टैग आईडी डालना जरूरी है।"));
      return;
    }

    const parseOptionalNumber = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : Number.NaN;
    };

    const cleanDate = (value: string) => {
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    };

    const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

    const birthWeight = parseOptionalNumber(birthWeightKg);
    const currentWeight = parseOptionalNumber(currentWeightKg);
    const weaningWeight = parseOptionalNumber(weaningWeightKg);
    const dob = cleanDate(dateOfBirth);
    const lastWtDate = cleanDate(lastWeightDate);
    const weanDate = cleanDate(weaningDate);

    if (Number.isNaN(birthWeight) || Number.isNaN(currentWeight) || Number.isNaN(weaningWeight)) {
      Alert.alert(x("Invalid number", "गलत संख्या"), x("Please enter valid weight values.", "वजन की सही संख्या दर्ज करें।"));
      return;
    }
    if ((dob && !isIsoDate(dob)) || (lastWtDate && !isIsoDate(lastWtDate)) || (weanDate && !isIsoDate(weanDate))) {
      Alert.alert(
        x("Invalid date", "गलत तारीख"),
        x("Use date format YYYY-MM-DD.", "तारीख का फॉर्मेट YYYY-MM-DD रखें।")
      );
      return;
    }
    if (dob && weanDate && weanDate < dob) {
      Alert.alert(
        x("Invalid dates", "गलत तारीखें"),
        x("Weaning date cannot be before date of birth.", "दूध छुड़ाने की तारीख जन्मतिथि से पहले नहीं हो सकती।")
      );
      return;
    }
    if (dob && lastWtDate && lastWtDate < dob) {
      Alert.alert(
        x("Invalid dates", "गलत तारीखें"),
        x("Last weight date cannot be before date of birth.", "आखिरी वजन की तारीख जन्मतिथि से पहले नहीं हो सकती।")
      );
      return;
    }

    try {
      setSaving(true);
      const payload = {
        tag: tag.trim(),
        name: name.trim() || null,
        breed,
        status,
        isActive,
        motherAnimalId: motherAnimalId.trim() || null,
        sireTag: sireTag.trim() || null,
        dateOfBirth: dob,
        growthStage: growthStage || null,
        birthWeightKg: birthWeight,
        currentWeightKg: currentWeight,
        lastWeightDate: lastWtDate,
        weaningDate: weanDate,
        weaningWeightKg: weaningWeight,
      };
      if (editingAnimalId) {
        await AnimalApi.update(editingAnimalId, payload);
      } else {
        await AnimalApi.create(payload);
      }
      await loadAnimals();
      resetForm();
      Alert.alert(
        x("Saved", "सेव हो गया"),
        editingAnimalId ? x("Animal updated.", "जानवर अपडेट हो गया।") : x("Animal added.", "जानवर जोड़ दिया गया।")
      );
    } catch (e: any) {
      console.error(e);
      const message = String(e?.message ?? x("Could not save animal.", "जानवर सेव नहीं हो पाया।"));
      if (message.includes("HTTP 403")) {
        Alert.alert(
          x("Role restricted", "रोल अनुमति नहीं"),
          editingAnimalId
            ? x("Only ADMIN or MANAGER users can edit animals.", "जानवर बदलना सिर्फ ADMIN या MANAGER कर सकता है।")
            : x("Only ADMIN users can add animals.", "जानवर जोड़ना सिर्फ ADMIN कर सकता है।")
        );
        return;
      }
      if (message.includes("uk_animal_tag")) {
        Alert.alert(
          x("Save failed", "सेव नहीं हुआ"),
          x("This tag already exists. Please use a unique animal tag.", "यह टैग पहले से मौजूद है। नया टैग डालें।")
        );
      } else if (message.includes("Tag must be different from animal ID")) {
        Alert.alert(
          x("Save failed", "सेव नहीं हुआ"),
          x("Tag ID must be different from Animal ID.", "टैग आईडी और Animal ID अलग होने चाहिए।")
        );
      } else {
        Alert.alert(x("Save failed", "सेव नहीं हुआ"), message);
      }
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (animal: AnimalResponse) => {
    if (!canEditAnimals) {
      Alert.alert(
        x("Role restricted", "रोल अनुमति नहीं"),
        x("Only ADMIN or MANAGER users can edit animals.", "जानवर बदलना सिर्फ ADMIN या MANAGER कर सकता है।")
      );
      return;
    }
    setEditingAnimalId(animal.animalId);
    setTag(animal.tag);
    setName(animal.name ?? "");
    setBreed((BREED_OPTIONS.includes(animal.breed as (typeof BREED_OPTIONS)[number]) ? animal.breed : BREED_OPTIONS[0]) as string);
    setStatus(animal.status);
    setIsActive(animal.isActive);
    setMotherAnimalId(animal.motherAnimalId ?? "");
    setSireTag(animal.sireTag ?? "");
    setDateOfBirth(animal.dateOfBirth ?? "");
    setGrowthStage(animal.growthStage ?? "");
    setBirthWeightKg(animal.birthWeightKg == null ? "" : String(animal.birthWeightKg));
    setCurrentWeightKg(animal.currentWeightKg == null ? "" : String(animal.currentWeightKg));
    setLastWeightDate(animal.lastWeightDate ?? "");
    setWeaningDate(animal.weaningDate ?? "");
    setWeaningWeightKg(animal.weaningWeightKg == null ? "" : String(animal.weaningWeightKg));
    setShowForm(true);
  };

  const summary = useMemo(() => {
    const total = animals.length;
    const lactating = animals.filter((a) => a.status === "LACTATING").length;
    const active = animals.filter((a) => a.isActive).length;
    return { total, lactating, active };
  }, [animals]);

  const topContributors = useMemo(
    () => (herdProfitability?.items ?? []).filter((row) => row.estimatedNet > 0).slice(0, 4),
    [herdProfitability]
  );
  const reviewList = useMemo(
    () =>
      (herdProfitability?.items ?? [])
        .filter((row) => row.estimatedNet < 0 || row.cullingReviewSuggested)
        .slice(0, 4),
    [herdProfitability]
  );

  const openAnimalDetails = (animalId: string) => {
    router.push(`/animals/${encodeURIComponent(animalId)}`);
  };

  const openAnimalByTag = async () => {
    const tagValue = lookupTag.trim();
    if (!tagValue) {
      Alert.alert(x("Missing details", "जानकारी अधूरी"), x("Enter a tag to search.", "खोजने के लिए टैग डालें।"));
      return;
    }
    try {
      setLookupLoading(true);
      const result = await AnimalApi.byTag(tagValue);
      router.push(`/animals/${encodeURIComponent(result.animalId)}`);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Not found", "नहीं मिला"),
        e?.message?.includes("HTTP 404")
          ? x("No animal found for this tag.", "इस टैग का जानवर नहीं मिला।")
          : e?.message ?? x("Could not search this tag.", "यह टैग खोजा नहीं जा सका।")
      );
    } finally {
      setLookupLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: DairyColors.background }}>
      <FlatList
        data={animals}
        keyExtractor={(item) => item.animalId}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponent={
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
                  {x("Animals", "जानवर")}
                </Text>
                <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                  {x("Herd health and lifecycle tracking", "झुंड की सेहत और जीवन चक्र रिकॉर्ड")}
                </Text>
              </View>
              <Pressable
                onPress={loadAnimals}
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
                borderRadius: 12,
                backgroundColor: DairyColors.surface,
                padding: 10,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                {x("Quick Tag Lookup", "टैग से तुरंत खोज")}
              </Text>
              <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
                <TextInput
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 10,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surfaceMuted,
                  }}
                  placeholder={x("Enter tag (e.g. GIR-123)", "टैग डालें (जैसे GIR-123)")}
                  placeholderTextColor="#99A99A"
                  value={lookupTag}
                  onChangeText={setLookupTag}
                  autoCapitalize="characters"
                />
                <Pressable
                  onPress={() => void openAnimalByTag()}
                  disabled={lookupLoading}
                  style={{
                    borderRadius: 10,
                    backgroundColor: lookupLoading ? DairyColors.textSecondary : DairyColors.primary,
                    paddingHorizontal: 14,
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "800" }}>
                    {lookupLoading ? x("Searching...", "खोज रहे हैं...") : x("Find", "खोजें")}
                  </Text>
                </Pressable>
              </View>
            </View>

            {canAddAnimals ? (
              <Pressable
                onPress={openAddForm}
                style={{
                  marginTop: 12,
                  backgroundColor: DairyColors.primary,
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Ionicons name="add-circle" size={18} color="white" />
                <Text style={{ color: "white", fontWeight: "800" }}>{x("Add Animal", "जानवर जोड़ें")}</Text>
              </Pressable>
            ) : null}

            <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <View style={{ flex: 1, minWidth: 100, backgroundColor: DairyColors.accentSoft, borderRadius: 12, padding: 10 }}>
                <Text style={{ color: DairyColors.textSecondary }}>{x("Total", "कुल")}</Text>
                <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>{summary.total}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 100, backgroundColor: DairyColors.successSoft, borderRadius: 12, padding: 10 }}>
                <Text style={{ color: DairyColors.textSecondary }}>{x("Lactating", "दूध दे रहे")}</Text>
                <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>{summary.lactating}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 100, backgroundColor: DairyColors.infoSoft, borderRadius: 12, padding: 10 }}>
                <Text style={{ color: DairyColors.textSecondary }}>{x("Active", "सक्रिय")}</Text>
                <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>{summary.active}</Text>
              </View>
            </View>

            <View
              style={{
                marginTop: 12,
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 12,
                backgroundColor: DairyColors.surface,
                padding: 10,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                  {x("Herd Profitability (30 days)", "झुंड लाभ (30 दिन)")}
                </Text>
                <Pressable
                  onPress={() => void loadHerdProfitability()}
                  disabled={profitabilityLoading || animals.length === 0}
                  style={{
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    backgroundColor: profitabilityLoading ? DairyColors.backgroundAlt : DairyColors.surfaceMuted,
                  }}
                >
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                    {profitabilityLoading ? x("Loading...", "लोड...") : x("Refresh", "रिफ्रेश")}
                  </Text>
                </Pressable>
              </View>
              {profitabilityLoading ? (
                <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
                  {x("Computing per-animal profitability...", "प्रति-जानवर लाभ गणना हो रही है...")}
                </Text>
              ) : !herdProfitability || herdProfitability.items.length === 0 ? (
                <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
                  {x("Add more milk/feed/sales data to see profitability insights.", "लाभ विश्लेषण देखने के लिए दूध/फीड/बिक्री डेटा जोड़ें।")}
                </Text>
              ) : (
                <>
                  <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
                    {x(
                      `${herdProfitability.fromDate} to ${herdProfitability.toDate} | Animals ${herdProfitability.totalAnimals} | Net Rs ${herdProfitability.totalEstimatedNet.toFixed(2)} | Review ${herdProfitability.cullingReviewCount}`,
                      `${herdProfitability.fromDate} से ${herdProfitability.toDate} | जानवर ${herdProfitability.totalAnimals} | नेट Rs ${herdProfitability.totalEstimatedNet.toFixed(2)} | समीक्षा ${herdProfitability.cullingReviewCount}`
                    )}
                  </Text>
                  {topContributors.length > 0 ? (
                    <View style={{ marginTop: 8 }}>
                      <Text style={{ color: DairyColors.success, fontWeight: "700" }}>
                        {x("Top Contributors", "शीर्ष योगदान")}
                      </Text>
                      {topContributors.map((row) => (
                        <Pressable
                          key={`top-profit-${row.animalId}`}
                          onPress={() => openAnimalDetails(row.animalId)}
                          style={{
                            marginTop: 6,
                            borderWidth: 1,
                            borderColor: DairyColors.border,
                            borderRadius: 10,
                            backgroundColor: DairyColors.successSoft,
                            padding: 8,
                          }}
                        >
                          <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                            {row.name?.trim() ? row.name : row.tag}
                          </Text>
                          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                            {x(
                              `Net ${row.estimatedNet.toFixed(2)} | ROI ${row.roiPercent == null ? "-" : `${row.roiPercent.toFixed(1)}%`} | Avg ${row.avgMilkPerDay.toFixed(2)} L/day`,
                              `नेट ${row.estimatedNet.toFixed(2)} | ROI ${row.roiPercent == null ? "-" : `${row.roiPercent.toFixed(1)}%`} | औसत ${row.avgMilkPerDay.toFixed(2)} ली/दिन`
                            )}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}

                  {reviewList.length > 0 ? (
                    <View style={{ marginTop: 10 }}>
                      <Text style={{ color: DairyColors.warning, fontWeight: "700" }}>
                        {x("Needs Review", "समीक्षा जरूरी")}
                      </Text>
                      {reviewList.map((row) => (
                        <Pressable
                          key={`review-profit-${row.animalId}`}
                          onPress={() => openAnimalDetails(row.animalId)}
                          style={{
                            marginTop: 6,
                            borderWidth: 1,
                            borderColor: DairyColors.border,
                            borderRadius: 10,
                            backgroundColor: DairyColors.warningSoft,
                            padding: 8,
                          }}
                        >
                          <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                            {row.name?.trim() ? row.name : row.tag}
                          </Text>
                          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                            {x(
                              `Net ${row.estimatedNet.toFixed(2)} | ROI ${row.roiPercent == null ? "-" : `${row.roiPercent.toFixed(1)}%`} | Avg ${row.avgMilkPerDay.toFixed(2)} L/day`,
                              `नेट ${row.estimatedNet.toFixed(2)} | ROI ${row.roiPercent == null ? "-" : `${row.roiPercent.toFixed(1)}%`} | औसत ${row.avgMilkPerDay.toFixed(2)} ली/दिन`
                            )}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </>
              )}
            </View>

            {showForm ? (
              <View
                style={{
                  marginTop: 14,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  borderRadius: 14,
                  padding: 14,
                  backgroundColor: DairyColors.surface,
                }}
              >
                <Text style={{ fontWeight: "800", color: DairyColors.textPrimary, fontSize: 16 }}>
                  {editingAnimalId ? x("Edit Animal", "जानवर बदलें") : x("Add Animal", "जानवर जोड़ें")}
                </Text>

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Tag ID", "टैग आईडी")}
                </Text>
                <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                  {x(
                    "Animal ID is auto-generated from breed + date/time + 4 digits.",
                    "Animal ID अपने-आप breed + date/time + 4 digits से बनेगा।"
                  )}
                </Text>
                <TextInput
                  style={{
                    marginTop: 6,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 11,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surfaceMuted,
                  }}
                  placeholder={x("Tag (e.g. GIR-004)", "टैग (जैसे GIR-004)")}
                  placeholderTextColor="#99A99A"
                  value={tag}
                  onChangeText={setTag}
                />

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Name (Optional)", "नाम (वैकल्पिक)")}
                </Text>
                <TextInput
                  style={{
                    marginTop: 6,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 11,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surfaceMuted,
                  }}
                  placeholder={x("Animal name (optional)", "जानवर का नाम (वैकल्पिक)")}
                  placeholderTextColor="#99A99A"
                  value={name}
                  onChangeText={setName}
                />

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Breed", "नस्ल")}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                  {BREED_OPTIONS.map((option) => (
                    <Pressable
                      key={option}
                      onPress={() => setBreed(option)}
                      style={{
                        borderWidth: 1,
                        borderColor: breed === option ? DairyColors.primary : DairyColors.border,
                        backgroundColor: breed === option ? DairyColors.primarySoft : DairyColors.surface,
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                      }}
                    >
                        <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{label("breed", option)}</Text>
                      </Pressable>
                  ))}
                </View>

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Status", "स्थिति")}
                </Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                  {STATUS_OPTIONS.map((s) => {
                    const tone = statusTone(s);
                    const selected = status === s;
                    return (
                      <Pressable
                        key={s}
                        onPress={() => setStatus(s)}
                        style={{
                          borderWidth: 1,
                          borderColor: selected ? tone.text : DairyColors.border,
                          backgroundColor: selected ? tone.background : DairyColors.surface,
                          borderRadius: 999,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                        }}
                      >
                        <Text style={{ color: selected ? tone.text : DairyColors.textPrimary, fontWeight: "700" }}>
                          {label("animalStatus", s)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{x("Active", "सक्रिय")}</Text>
                  <Switch value={isActive} onValueChange={setIsActive} />
                </View>

                <Text style={{ marginTop: 14, color: DairyColors.textPrimary, fontWeight: "800" }}>
                  {x("Parentage and Growth (Optional)", "माता-पिता और ग्रोथ (वैकल्पिक)")}
                </Text>

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Mother Animal ID", "मां का जानवर आईडी")}
                </Text>
                <TextInput
                  style={{
                    marginTop: 6,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 11,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surfaceMuted,
                  }}
                  placeholder={x("e.g. GIR2502241430-4821 or GIR-001", "जैसे GIR2502241430-4821 या GIR-001")}
                  placeholderTextColor="#99A99A"
                  value={motherAnimalId}
                  onChangeText={setMotherAnimalId}
                />

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Sire/Bull Tag", "बैल/सायर टैग")}
                </Text>
                <TextInput
                  style={{
                    marginTop: 6,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 11,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surfaceMuted,
                  }}
                  placeholder={x("e.g. BULL-09", "जैसे BULL-09")}
                  placeholderTextColor="#99A99A"
                  value={sireTag}
                  onChangeText={setSireTag}
                />

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Date of Birth (YYYY-MM-DD)", "जन्मतिथि (YYYY-MM-DD)")}
                </Text>
                <DateInput
                  placeholder="YYYY-MM-DD"
                  value={dateOfBirth}
                  onChangeText={setDateOfBirth}
                />

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Growth Stage", "ग्रोथ स्टेज")}
                </Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                  {GROWTH_STAGE_OPTIONS.map((stage) => {
                    const selected = growthStage === stage;
                    const stageLabel =
                      stage === "CALF"
                        ? x("Calf", "बछड़ा/बछड़ी")
                        : stage === "GROWER"
                          ? x("Grower", "बड़ी हो रही")
                          : x("Adult", "वयस्क");
                    return (
                      <Pressable
                        key={stage}
                        onPress={() => setGrowthStage(stage)}
                        style={{
                          borderWidth: 1,
                          borderColor: selected ? DairyColors.primary : DairyColors.border,
                          backgroundColor: selected ? DairyColors.primarySoft : DairyColors.surface,
                          borderRadius: 999,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                        }}
                      >
                        <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{stageLabel}</Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    onPress={() => setGrowthStage("")}
                    style={{
                      borderWidth: 1,
                      borderColor: !growthStage ? DairyColors.primary : DairyColors.border,
                      backgroundColor: !growthStage ? DairyColors.primarySoft : DairyColors.surface,
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}
                  >
                    <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{x("Clear", "हटाएं")}</Text>
                  </Pressable>
                </View>

                <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
                      {x("Birth Weight (kg)", "जन्म वजन (किग्रा)")}
                    </Text>
                    <TextInput
                      style={{
                        marginTop: 6,
                        borderWidth: 1,
                        borderColor: DairyColors.border,
                        borderRadius: 10,
                        padding: 11,
                        color: DairyColors.textPrimary,
                        backgroundColor: DairyColors.surfaceMuted,
                      }}
                      placeholder="0.0"
                      placeholderTextColor="#99A99A"
                      keyboardType="decimal-pad"
                      value={birthWeightKg}
                      onChangeText={setBirthWeightKg}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
                      {x("Current Weight (kg)", "वर्तमान वजन (किग्रा)")}
                    </Text>
                    <TextInput
                      style={{
                        marginTop: 6,
                        borderWidth: 1,
                        borderColor: DairyColors.border,
                        borderRadius: 10,
                        padding: 11,
                        color: DairyColors.textPrimary,
                        backgroundColor: DairyColors.surfaceMuted,
                      }}
                      placeholder="0.0"
                      placeholderTextColor="#99A99A"
                      keyboardType="decimal-pad"
                      value={currentWeightKg}
                      onChangeText={setCurrentWeightKg}
                    />
                  </View>
                </View>

                <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
                      {x("Last Weight Date", "आखिरी वजन तारीख")}
                    </Text>
                    <DateInput
                      placeholder="YYYY-MM-DD"
                      value={lastWeightDate}
                      onChangeText={setLastWeightDate}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
                      {x("Weaning Date", "दूध छुड़ाने की तारीख")}
                    </Text>
                    <DateInput
                      placeholder="YYYY-MM-DD"
                      value={weaningDate}
                      onChangeText={setWeaningDate}
                    />
                  </View>
                </View>

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Weaning Weight (kg)", "दूध छुड़ाने पर वजन (किग्रा)")}
                </Text>
                <TextInput
                  style={{
                    marginTop: 6,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 11,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surfaceMuted,
                  }}
                  placeholder="0.0"
                  placeholderTextColor="#99A99A"
                  keyboardType="decimal-pad"
                  value={weaningWeightKg}
                  onChangeText={setWeaningWeightKg}
                />

                <Pressable
                  disabled={saving}
                  onPress={submitAnimal}
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: saving ? DairyColors.textSecondary : DairyColors.primary,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "800" }}>
                    {saving
                      ? x("Saving...", "सेव हो रहा है...")
                      : editingAnimalId
                        ? x("Update Animal", "जानवर अपडेट करें")
                        : x("Add Animal", "जानवर जोड़ें")}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={resetForm}
                  style={{
                    marginTop: 8,
                    padding: 11,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    alignItems: "center",
                    backgroundColor: DairyColors.surface,
                  }}
                >
                  <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>{x("Cancel", "रद्द करें")}</Text>
                </Pressable>
              </View>
            ) : null}

            <Text style={{ marginTop: 14, marginBottom: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
              {x("Herd Records", "झुंड रिकॉर्ड")}
            </Text>
          </>
        }
        renderItem={({ item }) => {
          const tone = statusTone(item.status);
          return (
            <View
              style={{
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 14,
                backgroundColor: DairyColors.surface,
                padding: 12,
              }}
            >
              <Pressable
                onPress={() => openAnimalDetails(item.animalId)}
                style={({ pressed }) => ({
                  borderRadius: 10,
                  padding: 2,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: DairyColors.textPrimary, fontSize: 16, fontWeight: "800" }}>
                    {item.name?.trim() ? item.name : item.tag}
                  </Text>
                  <View
                    style={{
                      borderRadius: 999,
                      backgroundColor: item.isActive ? DairyColors.successSoft : DairyColors.backgroundAlt,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                    }}
                  >
                    <Text style={{ color: item.isActive ? DairyColors.success : DairyColors.textSecondary, fontWeight: "700" }}>
                      {item.isActive ? x("ACTIVE", "सक्रिय") : x("INACTIVE", "निष्क्रिय")}
                    </Text>
                  </View>
                </View>

                <Text style={{ marginTop: 6, color: DairyColors.textSecondary }}>
                  {x("Tag ID", "टैग आईडी")}: {item.tag}
                </Text>

                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {label("breed", item.breed)}
                </Text>

                <View
                  style={{
                    marginTop: 8,
                    alignSelf: "flex-start",
                    borderRadius: 999,
                    backgroundColor: tone.background,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                  }}
                >
                  <Text style={{ color: tone.text, fontWeight: "700" }}>
                    {label("animalStatus", item.status)}
                  </Text>
                </View>
              </Pressable>

              <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Pressable
                  onPress={() => openAnimalDetails(item.animalId)}
                  style={{
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    alignSelf: "flex-start",
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    backgroundColor: DairyColors.surfaceMuted,
                  }}
                >
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{x("View Details", "विवरण देखें")}</Text>
                </Pressable>
                {canEditAnimals ? (
                  <Pressable
                    onPress={() => startEdit(item)}
                    style={{
                      borderWidth: 1,
                      borderColor: DairyColors.border,
                      borderRadius: 10,
                      alignSelf: "flex-start",
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      backgroundColor: DairyColors.surfaceMuted,
                    }}
                  >
                    <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{x("Edit", "बदलें")}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={{ marginTop: 20, color: DairyColors.textSecondary }}>
            {loading ? x("Loading animals...", "जानवर लोड हो रहे हैं...") : x("No animals found.", "कोई जानवर नहीं मिला।")}
          </Text>
        }
      />
    </View>
  );
}
