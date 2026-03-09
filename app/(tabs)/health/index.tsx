import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  AnimalApi,
  AnimalResponse,
  CreateDewormingPayload,
  CreateVaccinationPayload,
  DewormingResponse,
  HealthApi,
  HealthSummaryResponse,
  MilkEntryApi,
  MilkEntryResponse,
  VaccinationResponse,
  WorklistApi,
  WorklistItemResponse,
} from "@/src/services/api";
import { DairyColors } from "@/src/constants/dairy-theme";
import { useAuth } from "@/src/state/auth";
import { shiftIsoDate, todayLocalISO } from "@/src/utils/date";
import { useI18n } from "@/src/state/i18n";
import { DateInput } from "../../../components/date-input";

type HealthTab = "VACCINATION" | "DEWORMING";
type DueFilter = "ALL" | "DUE_TODAY" | "DUE_SOON" | "OVERDUE";
type DueStatus = "NO_DUE" | "DUE_TODAY" | "DUE_SOON" | "OVERDUE";
type VaccineKey =
  | "FMD"
  | "BRUCELLOSIS"
  | "HS"
  | "BQ"
  | "ANTHRAX"
  | "LSD"
  | "THEILERIOSIS"
  | "OTHER";

type TimelineEvent = {
  id: string;
  date: string;
  title: string;
  subtitle: string;
  kind: "VACCINATION" | "DEWORMING" | "MILK";
};

const DUE_FILTERS: DueFilter[] = ["ALL", "DUE_TODAY", "DUE_SOON", "OVERDUE"];
// Dropdown options aligned with DAHD references:
// - NADCP/CADCP guidance (FMD, Brucellosis)
// - DAHD semen-station minimum standards vaccination section (FMD, HS, BQ, Theileriosis, LSD, Anthrax)
const VACCINE_OPTIONS: {
  key: VaccineKey;
  vaccineName: string;
  diseaseTarget: string;
  diseaseTargetHi: string;
  labelEn: string;
  labelHi: string;
  nextShotDays: number | null;
  scheduleHintEn: string;
  scheduleHintHi: string;
}[] = [
  {
    key: "FMD",
    vaccineName: "FMD",
    diseaseTarget: "Foot and Mouth Disease",
    diseaseTargetHi: "मुंह और खुरपका रोग",
    labelEn: "FMD",
    labelHi: "एफएमडी",
    nextShotDays: 180,
    scheduleHintEn: "Repeat every 6 months.",
    scheduleHintHi: "हर 6 महीने में अगला डोज दें।",
  },
  {
    key: "BRUCELLOSIS",
    vaccineName: "Brucellosis",
    diseaseTarget: "Bovine Brucellosis",
    diseaseTargetHi: "ब्रुसेलोसिस",
    labelEn: "Brucellosis",
    labelHi: "ब्रुसेलोसिस",
    nextShotDays: null,
    scheduleHintEn: "Usually single calf dose (female calves) as per program.",
    scheduleHintHi: "आमतौर पर बछिया में एक बार का डोज (कार्यक्रम के अनुसार)।",
  },
  {
    key: "HS",
    vaccineName: "HS",
    diseaseTarget: "Haemorrhagic Septicaemia",
    diseaseTargetHi: "हैमोरेजिक सेप्टीसीमिया (गलघोटू)",
    labelEn: "HS",
    labelHi: "एचएस",
    nextShotDays: 365,
    scheduleHintEn: "Repeat annually (commonly before monsoon).",
    scheduleHintHi: "हर साल दोहराएं (आमतौर पर मानसून से पहले)।",
  },
  {
    key: "BQ",
    vaccineName: "BQ",
    diseaseTarget: "Black Quarter",
    diseaseTargetHi: "ब्लैक क्वार्टर (लंगड़ा बुखार)",
    labelEn: "BQ",
    labelHi: "बीक्यू",
    nextShotDays: 365,
    scheduleHintEn: "Repeat annually in endemic areas.",
    scheduleHintHi: "प्रभावित क्षेत्रों में हर साल दोहराएं।",
  },
  {
    key: "ANTHRAX",
    vaccineName: "Anthrax",
    diseaseTarget: "Anthrax",
    diseaseTargetHi: "एंथ्रैक्स",
    labelEn: "Anthrax",
    labelHi: "एंथ्रैक्स",
    nextShotDays: 365,
    scheduleHintEn: "Repeat annually in endemic areas.",
    scheduleHintHi: "प्रभावित क्षेत्रों में हर साल दोहराएं।",
  },
  {
    key: "LSD",
    vaccineName: "LSD",
    diseaseTarget: "Lumpy Skin Disease",
    diseaseTargetHi: "लम्पी स्किन रोग",
    labelEn: "LSD",
    labelHi: "लम्पी स्किन डिजीज",
    nextShotDays: 365,
    scheduleHintEn: "Annual campaign cycle; follow latest state advisory.",
    scheduleHintHi: "वार्षिक अभियान चक्र; राज्य की नवीन सलाह का पालन करें।",
  },
  {
    key: "THEILERIOSIS",
    vaccineName: "Theileriosis",
    diseaseTarget: "Theileriosis",
    diseaseTargetHi: "थाइलेरियोसिस",
    labelEn: "Theileriosis",
    labelHi: "थाइलेरियोसिस",
    nextShotDays: null,
    scheduleHintEn: "Often one-time in eligible calves; follow vet guidance.",
    scheduleHintHi: "अक्सर योग्य बछड़ों में एक बार; पशु चिकित्सक सलाह लें।",
  },
  {
    key: "OTHER",
    vaccineName: "",
    diseaseTarget: "",
    diseaseTargetHi: "",
    labelEn: "Other",
    labelHi: "अन्य",
    nextShotDays: null,
    scheduleHintEn: "Custom vaccine; enter next due manually.",
    scheduleHintHi: "कस्टम वैक्सीन; अगली तारीख हाथ से भरें।",
  },
];

function classifyDue(nextDueDate: string | null | undefined, baseDate: string, windowDays = 7): DueStatus {
  if (!nextDueDate) {
    return "NO_DUE";
  }
  if (nextDueDate < baseDate) {
    return "OVERDUE";
  }
  if (nextDueDate === baseDate) {
    return "DUE_TODAY";
  }
  const dueSoonLastDay = shiftIsoDate(baseDate, windowDays);
  if (nextDueDate <= dueSoonLastDay) {
    return "DUE_SOON";
  }
  return "NO_DUE";
}

function dueTone(status: DueStatus) {
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

function timelineTone(kind: TimelineEvent["kind"]) {
  if (kind === "VACCINATION") {
    return { text: DairyColors.info, background: DairyColors.infoSoft };
  }
  if (kind === "DEWORMING") {
    return { text: DairyColors.warning, background: DairyColors.warningSoft };
  }
  return { text: DairyColors.primary, background: DairyColors.primarySoft };
}

function sortDescByDate<T extends { date: string }>(rows: T[]) {
  return [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

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

function vaccineByKey(key: VaccineKey) {
  return VACCINE_OPTIONS.find((option) => option.key === key) ?? VACCINE_OPTIONS[VACCINE_OPTIONS.length - 1];
}

function vaccineKeyFromName(vaccineName: string): VaccineKey {
  const normalized = vaccineName.trim().toLowerCase();
  if (!normalized) {
    return "FMD";
  }
  const found = VACCINE_OPTIONS.find(
    (option) => option.key !== "OTHER" && option.vaccineName.trim().toLowerCase() === normalized
  );
  return found?.key ?? "OTHER";
}

function autoNextDueDate(vaccineKey: VaccineKey, doseDate: string) {
  const option = vaccineByKey(vaccineKey);
  if (option.nextShotDays == null) {
    return null;
  }
  return addDaysIso(doseDate, option.nextShotDays);
}

function resolvedVaccinationNextDue(row: Pick<VaccinationResponse, "vaccineName" | "doseDate" | "nextDueDate">) {
  if (row.nextDueDate) {
    return row.nextDueDate;
  }
  const key = vaccineKeyFromName(row.vaccineName ?? "");
  return autoNextDueDate(key, row.doseDate) ?? null;
}

export default function HealthScreen() {
  const params = useLocalSearchParams<{ animalId?: string; tag?: string }>();
  const router = useRouter();
  const { hasAnyRole, user } = useAuth();
  const { x, language } = useI18n();
  const canManageHealth = hasAnyRole("ADMIN", "MANAGER", "VET");
  const canOpenFeedLog = hasAnyRole("ADMIN", "MANAGER", "WORKER", "FEED_MANAGER");
  const isVetRole = user?.role === "VET";

  const [tab, setTab] = useState<HealthTab>("VACCINATION");
  const [dueFilter, setDueFilter] = useState<DueFilter>("ALL");
  const [date] = useState(todayLocalISO());

  const [animals, setAnimals] = useState<AnimalResponse[]>([]);
  const [selectedAnimalId, setSelectedAnimalId] = useState("");
  const [summary, setSummary] = useState<HealthSummaryResponse | null>(null);
  const [vetTasks, setVetTasks] = useState<WorklistItemResponse[]>([]);

  const [vaccinations, setVaccinations] = useState<VaccinationResponse[]>([]);
  const [deworming, setDeworming] = useState<DewormingResponse[]>([]);
  const [milkEntries, setMilkEntries] = useState<MilkEntryResponse[]>([]);

  const [loading, setLoading] = useState(false);
  const [savingVaccination, setSavingVaccination] = useState(false);
  const [savingDeworming, setSavingDeworming] = useState(false);

  const [editingVaccinationId, setEditingVaccinationId] = useState<string | null>(null);
  const [editingDewormingId, setEditingDewormingId] = useState<string | null>(null);

  const [selectedVaccineKey, setSelectedVaccineKey] = useState<VaccineKey>("FMD");
  const [vaccineName, setVaccineName] = useState(vaccineByKey("FMD").vaccineName);
  const [diseaseTarget, setDiseaseTarget] = useState(vaccineByKey("FMD").diseaseTarget);
  const [vDoseDate, setVDoseDate] = useState(todayLocalISO());
  const [nextDueAuto, setNextDueAuto] = useState(true);
  const [vNextDueDate, setVNextDueDate] = useState(() => autoNextDueDate("FMD", todayLocalISO()) ?? "");
  const [vBoosterDueDate, setVBoosterDueDate] = useState("");
  const [vaccineExpiryDate, setVaccineExpiryDate] = useState("");
  const [vDoseNumber, setVDoseNumber] = useState("");
  const [vBatchLotNo, setVBatchLotNo] = useState("");
  const [vRoute, setVRoute] = useState("");
  const [vNotes, setVNotes] = useState("");

  const [dDrugName, setDDrugName] = useState("");
  const [dDoseDate, setDDoseDate] = useState(todayLocalISO());
  const [dNextDueDate, setDNextDueDate] = useState("");
  const [dWeightAtDose, setDWeightAtDose] = useState("");
  const [dNotes, setDNotes] = useState("");

  const dueFilterLabel = (filter: DueFilter) => {
    if (filter === "ALL") return x("ALL", "सभी");
    if (filter === "DUE_TODAY") return x("DUE TODAY", "आज देय");
    if (filter === "DUE_SOON") return x("DUE SOON", "जल्द देय");
    return x("OVERDUE", "समय से बाकी");
  };

  const dueStatusLabel = (label: string) => {
    if (label === "OVERDUE") return x("OVERDUE", "समय से बाकी");
    if (label === "DUE TODAY") return x("DUE TODAY", "आज देय");
    if (label === "DUE SOON") return x("DUE SOON", "जल्द देय");
    return x("OK", "ठीक");
  };

  const tabLabel = (value: HealthTab) =>
    value === "VACCINATION" ? x("VACCINATION", "टीकाकरण") : x("DEWORMING", "पेट की दवा");

  const applyAutoNextDue = (vaccineKey: VaccineKey, doseDate: string) => {
    const nextDue = autoNextDueDate(vaccineKey, doseDate);
    setVNextDueDate(nextDue ?? "");
    setNextDueAuto(nextDue != null);
    return nextDue;
  };

  const onChangeVDoseDate = (value: string) => {
    setVDoseDate(value);
    if (nextDueAuto) {
      applyAutoNextDue(selectedVaccineKey, value);
    }
  };

  const onSelectVaccine = (key: VaccineKey) => {
    setSelectedVaccineKey(key);
    if (key === "OTHER") {
      setVaccineName("");
      setDiseaseTarget("");
      setNextDueAuto(false);
      setVNextDueDate("");
      return;
    }
    const selected = vaccineByKey(key);
    setVaccineName(selected.vaccineName);
    setDiseaseTarget(language === "hi" ? selected.diseaseTargetHi : selected.diseaseTarget);
    applyAutoNextDue(key, vDoseDate);
  };

  useEffect(() => {
    if (selectedVaccineKey === "OTHER") {
      return;
    }
    const selected = vaccineByKey(selectedVaccineKey);
    setVaccineName(selected.vaccineName);
    setDiseaseTarget(language === "hi" ? selected.diseaseTargetHi : selected.diseaseTarget);
  }, [language, selectedVaccineKey]);

  const timelineKindLabel = (kind: TimelineEvent["kind"]) => {
    if (kind === "VACCINATION") return x("VACCINATION", "टीका");
    if (kind === "DEWORMING") return x("DEWORMING", "पेट दवा");
    return x("MILK", "दूध");
  };

  const selectedAnimal = useMemo(
    () => animals.find((a) => a.animalId === selectedAnimalId) ?? null,
    [animals, selectedAnimalId]
  );

  const vetFocusSummary = useMemo(() => {
    const vetTypes = new Set([
      "VACCINATION_DUE",
      "DEWORMING_DUE",
      "PREGNANCY_CHECK_DUE",
      "CALVING_DUE",
      "MASTITIS_FOLLOW_UP",
    ]);
    const relevant = vetTasks.filter((row) => vetTypes.has(row.type));
    return {
      total: relevant.length,
      overdue: relevant.filter((row) => row.dueStatus === "OVERDUE").length,
      dueToday: relevant.filter((row) => row.dueStatus === "DUE_TODAY").length,
      dueSoon: relevant.filter((row) => row.dueStatus === "DUE_SOON").length,
      highPriority: relevant.filter((row) => row.priority === "HIGH").length,
    };
  }, [vetTasks]);

  const resetVaccinationForm = () => {
    const today = todayLocalISO();
    setEditingVaccinationId(null);
    setSelectedVaccineKey("FMD");
    setVaccineName(vaccineByKey("FMD").vaccineName);
    setDiseaseTarget(language === "hi" ? vaccineByKey("FMD").diseaseTargetHi : vaccineByKey("FMD").diseaseTarget);
    setVDoseDate(today);
    setNextDueAuto(true);
    setVNextDueDate(autoNextDueDate("FMD", today) ?? "");
    setVBoosterDueDate("");
    setVaccineExpiryDate("");
    setVDoseNumber("");
    setVBatchLotNo("");
    setVRoute("");
    setVNotes("");
  };

  const resetDewormingForm = () => {
    setEditingDewormingId(null);
    setDDrugName("");
    setDDoseDate(todayLocalISO());
    setDNextDueDate("");
    setDWeightAtDose("");
    setDNotes("");
  };

  const loadRecords = useCallback(
    async (animalId: string) => {
      if (!animalId) {
        setVaccinations([]);
        setDeworming([]);
        setMilkEntries([]);
        return;
      }

      const dateFrom = shiftIsoDate(date, -30);
      const [vaccinationRows, dewormingRows, milkRows] = await Promise.all([
        HealthApi.listVaccinations(animalId),
        HealthApi.listDeworming(animalId),
        isVetRole ? Promise.resolve([]) : MilkEntryApi.historyByAnimal(animalId, dateFrom, date),
      ]);

      setVaccinations(vaccinationRows);
      setDeworming(dewormingRows);
      setMilkEntries(milkRows);
    },
    [date, isVetRole]
  );

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [animalRows, healthSummary, todayWorklist] = await Promise.all([
        AnimalApi.list({ active: true }),
        HealthApi.summary(date, 7),
        WorklistApi.today(date, 7).catch(() => null),
      ]);

      setAnimals(animalRows);
      setSummary(healthSummary);
      setVetTasks(todayWorklist?.items ?? []);

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
      await loadRecords(nextAnimalId);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load health data.", "सेहत डेटा लोड नहीं हो पाया।")
      );
    } finally {
      setLoading(false);
    }
  }, [date, loadRecords, params.animalId, params.tag, selectedAnimalId, x]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onSelectAnimal = async (animalId: string) => {
    setSelectedAnimalId(animalId);
    setEditingVaccinationId(null);
    setEditingDewormingId(null);
    resetVaccinationForm();
    resetDewormingForm();

    try {
      setLoading(true);
      await loadRecords(animalId);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load animal health records.", "जानवर सेहत रिकॉर्ड लोड नहीं हो पाया।")
      );
    } finally {
      setLoading(false);
    }
  };

  const saveVaccination = async () => {
    if (!selectedAnimalId) {
      Alert.alert(x("Select animal", "जानवर चुनें"), x("Please select an animal first.", "पहले जानवर चुनें।"));
      return;
    }
    if (!canManageHealth) {
      Alert.alert(
        x("Role restricted", "रोल अनुमति नहीं"),
        x(
          "Only ADMIN, MANAGER or VET users can log health records.",
          "सेहत रिकॉर्ड सिर्फ ADMIN, MANAGER या VET दर्ज कर सकता है।"
        )
      );
      return;
    }
    if (!vaccineName.trim() || !diseaseTarget.trim()) {
      Alert.alert(
        x("Missing details", "जानकारी अधूरी"),
        x("Vaccine name and disease target are required.", "टीका नाम और बीमारी लक्ष्य जरूरी है।")
      );
      return;
    }

    const doseNumber = vDoseNumber.trim() ? Number(vDoseNumber) : null;
    if (doseNumber != null && (!Number.isFinite(doseNumber) || doseNumber <= 0)) {
      Alert.alert(x("Invalid value", "गलत मान"), x("Dose number must be a positive number.", "डोज संख्या पॉजिटिव होनी चाहिए।"));
      return;
    }

    const doseDate = vDoseDate.trim();
    const nextDueDate = vNextDueDate.trim();
    const boosterDueDate = vBoosterDueDate.trim();
    const expiryDate = vaccineExpiryDate.trim();

    if (!isIsoDate(doseDate)) {
      Alert.alert(
        x("Invalid date", "गलत तारीख"),
        x("Dose date must be in YYYY-MM-DD format.", "डोज तारीख YYYY-MM-DD फॉर्मेट में होनी चाहिए।")
      );
      return;
    }
    if (nextDueDate && !isIsoDate(nextDueDate)) {
      Alert.alert(
        x("Invalid date", "गलत तारीख"),
        x("Next due date must be in YYYY-MM-DD format.", "अगली तारीख YYYY-MM-DD फॉर्मेट में होनी चाहिए।")
      );
      return;
    }
    if (boosterDueDate && !isIsoDate(boosterDueDate)) {
      Alert.alert(
        x("Invalid date", "गलत तारीख"),
        x("Booster date must be in YYYY-MM-DD format.", "बूस्टर तारीख YYYY-MM-DD फॉर्मेट में होनी चाहिए।")
      );
      return;
    }
    if (expiryDate && !isIsoDate(expiryDate)) {
      Alert.alert(
        x("Invalid date", "गलत तारीख"),
        x("Expiry date must be in YYYY-MM-DD format.", "एक्सपायरी तारीख YYYY-MM-DD फॉर्मेट में होनी चाहिए।")
      );
      return;
    }
    if (nextDueDate && nextDueDate < doseDate) {
      Alert.alert(
        x("Invalid date", "गलत तारीख"),
        x("Next due cannot be before dose date.", "अगली तारीख डोज तारीख से पहले नहीं हो सकती।")
      );
      return;
    }
    if (boosterDueDate && boosterDueDate < doseDate) {
      Alert.alert(
        x("Invalid date", "गलत तारीख"),
        x("Booster cannot be before dose date.", "बूस्टर तारीख डोज तारीख से पहले नहीं हो सकती।")
      );
      return;
    }
    if (expiryDate && expiryDate < doseDate) {
      Alert.alert(
        x("Invalid date", "गलत तारीख"),
        x("Vaccine expiry cannot be before dose date.", "वैक्सीन एक्सपायरी डोज तारीख से पहले नहीं हो सकती।")
      );
      return;
    }

    const normalizedNextDueDate =
      nextDueDate ||
      autoNextDueDate(vaccineKeyFromName(vaccineName), doseDate) ||
      null;

    const payload: CreateVaccinationPayload = {
      vaccineName: vaccineName.trim(),
      diseaseTarget: diseaseTarget.trim(),
      doseDate,
      doseNumber,
      nextDueDate: normalizedNextDueDate,
      boosterDueDate: boosterDueDate || null,
      vaccineExpiryDate: expiryDate || null,
      batchLotNo: vBatchLotNo.trim() || null,
      route: vRoute.trim() || null,
      notes: vNotes.trim() || null,
    };

    try {
      setSavingVaccination(true);
      if (editingVaccinationId) {
        await HealthApi.updateVaccination(selectedAnimalId, editingVaccinationId, payload);
      } else {
        await HealthApi.createVaccination(selectedAnimalId, payload);
      }
      await Promise.all([loadRecords(selectedAnimalId), HealthApi.summary(date, 7).then(setSummary)]);
      resetVaccinationForm();
      Alert.alert(
        x("Saved", "सेव हो गया"),
        editingVaccinationId ? x("Vaccination updated.", "टीका रिकॉर्ड अपडेट हुआ।") : x("Vaccination added.", "टीका रिकॉर्ड जोड़ दिया गया।")
      );
    } catch (e: any) {
      console.error(e);
      const message = String(e?.message ?? x("Could not save vaccination.", "टीका रिकॉर्ड सेव नहीं हो पाया।"));
      if (message.includes("HTTP 403")) {
        Alert.alert(
          x("Role restricted", "रोल अनुमति नहीं"),
          x(
            "Only ADMIN, MANAGER or VET users can log health records.",
            "सेहत रिकॉर्ड सिर्फ ADMIN, MANAGER या VET दर्ज कर सकता है।"
          )
        );
      } else {
        Alert.alert(x("Save failed", "सेव नहीं हुआ"), message);
      }
    } finally {
      setSavingVaccination(false);
    }
  };

  const saveDeworming = async () => {
    if (!selectedAnimalId) {
      Alert.alert(x("Select animal", "जानवर चुनें"), x("Please select an animal first.", "पहले जानवर चुनें।"));
      return;
    }
    if (!canManageHealth) {
      Alert.alert(
        x("Role restricted", "रोल अनुमति नहीं"),
        x(
          "Only ADMIN, MANAGER or VET users can log health records.",
          "सेहत रिकॉर्ड सिर्फ ADMIN, MANAGER या VET दर्ज कर सकता है।"
        )
      );
      return;
    }
    if (!dDrugName.trim()) {
      Alert.alert(x("Missing details", "जानकारी अधूरी"), x("Drug name is required.", "दवा का नाम जरूरी है।"));
      return;
    }

    const weightAtDoseKg = dWeightAtDose.trim() ? Number(dWeightAtDose) : null;
    if (weightAtDoseKg != null && (!Number.isFinite(weightAtDoseKg) || weightAtDoseKg <= 0)) {
      Alert.alert(
        x("Invalid value", "गलत मान"),
        x("Weight at dose must be a positive number.", "डोज के समय वजन पॉजिटिव होना चाहिए।")
      );
      return;
    }

    const payload: CreateDewormingPayload = {
      drugName: dDrugName.trim(),
      doseDate: dDoseDate.trim(),
      nextDueDate: dNextDueDate.trim() || null,
      weightAtDoseKg,
      notes: dNotes.trim() || null,
    };

    try {
      setSavingDeworming(true);
      if (editingDewormingId) {
        await HealthApi.updateDeworming(selectedAnimalId, editingDewormingId, payload);
      } else {
        await HealthApi.createDeworming(selectedAnimalId, payload);
      }
      await Promise.all([loadRecords(selectedAnimalId), HealthApi.summary(date, 7).then(setSummary)]);
      resetDewormingForm();
      Alert.alert(
        x("Saved", "सेव हो गया"),
        editingDewormingId ? x("Deworming updated.", "पेट दवा रिकॉर्ड अपडेट हुआ।") : x("Deworming added.", "पेट दवा रिकॉर्ड जोड़ दिया गया।")
      );
    } catch (e: any) {
      console.error(e);
      const message = String(e?.message ?? x("Could not save deworming record.", "पेट दवा रिकॉर्ड सेव नहीं हो पाया।"));
      if (message.includes("HTTP 403")) {
        Alert.alert(
          x("Role restricted", "रोल अनुमति नहीं"),
          x(
            "Only ADMIN, MANAGER or VET users can log health records.",
            "सेहत रिकॉर्ड सिर्फ ADMIN, MANAGER या VET दर्ज कर सकता है।"
          )
        );
      } else {
        Alert.alert(x("Save failed", "सेव नहीं हुआ"), message);
      }
    } finally {
      setSavingDeworming(false);
    }
  };

  const onEditVaccination = (row: VaccinationResponse) => {
    if (!canManageHealth) {
      Alert.alert(
        x("Role restricted", "रोल अनुमति नहीं"),
        x(
          "Only ADMIN, MANAGER or VET users can edit health records.",
          "सेहत रिकॉर्ड बदलना सिर्फ ADMIN, MANAGER या VET कर सकता है।"
        )
      );
      return;
    }
    setTab("VACCINATION");
    setEditingVaccinationId(row.vaccinationId);
    const key = vaccineKeyFromName(row.vaccineName);
    const computedNextDue = resolvedVaccinationNextDue(row);
    setSelectedVaccineKey(key);
    setVaccineName(row.vaccineName);
    setDiseaseTarget(row.diseaseTarget);
    setVDoseDate(row.doseDate);
    setNextDueAuto(!row.nextDueDate && !!computedNextDue);
    setVNextDueDate(computedNextDue ?? "");
    setVBoosterDueDate(row.boosterDueDate ?? "");
    setVaccineExpiryDate(row.vaccineExpiryDate ?? "");
    setVDoseNumber(row.doseNumber == null ? "" : String(row.doseNumber));
    setVBatchLotNo(row.batchLotNo ?? "");
    setVRoute(row.route ?? "");
    setVNotes(row.notes ?? "");
  };

  const onEditDeworming = (row: DewormingResponse) => {
    if (!canManageHealth) {
      Alert.alert(
        x("Role restricted", "रोल अनुमति नहीं"),
        x(
          "Only ADMIN, MANAGER or VET users can edit health records.",
          "सेहत रिकॉर्ड बदलना सिर्फ ADMIN, MANAGER या VET कर सकता है।"
        )
      );
      return;
    }
    setTab("DEWORMING");
    setEditingDewormingId(row.dewormingId);
    setDDrugName(row.drugName);
    setDDoseDate(row.doseDate);
    setDNextDueDate(row.nextDueDate ?? "");
    setDWeightAtDose(row.weightAtDoseKg == null ? "" : String(row.weightAtDoseKg));
    setDNotes(row.notes ?? "");
  };

  const onDeleteVaccination = (row: VaccinationResponse) => {
    if (!selectedAnimalId || !canManageHealth) {
      return;
    }
    Alert.alert(x("Delete vaccination", "टीका रिकॉर्ड हटाएं"), x(`Delete ${row.vaccineName} record?`, `${row.vaccineName} रिकॉर्ड हटाना है?`), [
      { text: x("Cancel", "रद्द"), style: "cancel" },
      {
        text: x("Delete", "हटाएं"),
        style: "destructive",
        onPress: async () => {
          try {
            await HealthApi.deleteVaccination(selectedAnimalId, row.vaccinationId);
            await Promise.all([loadRecords(selectedAnimalId), HealthApi.summary(date, 7).then(setSummary)]);
            if (editingVaccinationId === row.vaccinationId) {
              resetVaccinationForm();
            }
          } catch (e: any) {
            console.error(e);
            Alert.alert(
              x("Delete failed", "हटाया नहीं गया"),
              e?.message ?? x("Could not delete vaccination record.", "टीका रिकॉर्ड हटाया नहीं जा सका।")
            );
          }
        },
      },
    ]);
  };

  const onDeleteDeworming = (row: DewormingResponse) => {
    if (!selectedAnimalId || !canManageHealth) {
      return;
    }
    Alert.alert(x("Delete deworming", "पेट दवा रिकॉर्ड हटाएं"), x(`Delete ${row.drugName} record?`, `${row.drugName} रिकॉर्ड हटाना है?`), [
      { text: x("Cancel", "रद्द"), style: "cancel" },
      {
        text: x("Delete", "हटाएं"),
        style: "destructive",
        onPress: async () => {
          try {
            await HealthApi.deleteDeworming(selectedAnimalId, row.dewormingId);
            await Promise.all([loadRecords(selectedAnimalId), HealthApi.summary(date, 7).then(setSummary)]);
            if (editingDewormingId === row.dewormingId) {
              resetDewormingForm();
            }
          } catch (e: any) {
            console.error(e);
            Alert.alert(
              x("Delete failed", "हटाया नहीं गया"),
              e?.message ?? x("Could not delete deworming record.", "पेट दवा रिकॉर्ड हटाया नहीं जा सका।")
            );
          }
        },
      },
    ]);
  };

  const filteredVaccinations = useMemo(() => {
    if (dueFilter === "ALL") {
      return vaccinations;
    }
    return vaccinations.filter((row) => classifyDue(resolvedVaccinationNextDue(row), date) === dueFilter);
  }, [vaccinations, dueFilter, date]);

  const filteredDeworming = useMemo(() => {
    if (dueFilter === "ALL") {
      return deworming;
    }
    return deworming.filter((row) => classifyDue(row.nextDueDate, date) === dueFilter);
  }, [deworming, dueFilter, date]);

  const timeline = useMemo(() => {
    const rows: TimelineEvent[] = [];

    vaccinations.forEach((row) => {
      const nextDue = resolvedVaccinationNextDue(row);
      rows.push({
        id: `VAC_${row.vaccinationId}`,
        date: row.doseDate,
        kind: "VACCINATION",
        title: `${row.vaccineName} (${row.diseaseTarget})`,
        subtitle: x(
          `Dose ${row.doseNumber ?? "-"} | Next due ${nextDue ?? "-"}`,
          `डोज ${row.doseNumber ?? "-"} | अगली तारीख ${nextDue ?? "-"}`
        ),
      });
    });

    deworming.forEach((row) => {
      rows.push({
        id: `DWRM_${row.dewormingId}`,
        date: row.doseDate,
        kind: "DEWORMING",
        title: row.drugName,
        subtitle: x(
          `Next due ${row.nextDueDate ?? "-"} | Weight ${row.weightAtDoseKg ?? "-"}`,
          `अगली तारीख ${row.nextDueDate ?? "-"} | वजन ${row.weightAtDoseKg ?? "-"}`
        ),
      });
    });

    if (!isVetRole) {
      milkEntries.forEach((row) => {
        rows.push({
          id: `MILK_${row.milkEntryId}`,
          date: row.date,
          kind: "MILK",
          title: `${row.shift} milk ${row.liters.toFixed(2)} L`,
          subtitle: x(`QC ${row.qcStatus}`, `QC ${row.qcStatus === "PASS" ? "पास" : row.qcStatus === "HOLD" ? "होल्ड" : row.qcStatus === "REJECT" ? "रिजेक्ट" : "पेंडिंग"}`),
        });
      });
    }

    return sortDescByDate(rows).slice(0, 30);
  }, [vaccinations, deworming, milkEntries, isVetRole, x]);

  const sectionCard = {
    marginTop: 14,
    borderWidth: 1,
    borderColor: DairyColors.border,
    borderRadius: 14,
    backgroundColor: DairyColors.surface,
    padding: 12,
  } as const;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: DairyColors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 26 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
            {x("Animal Health", "जानवरों की सेहत")}
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x("Vaccination, deworming, and timeline", "टीकाकरण, पेट की दवा और टाइमलाइन")}
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

      <View style={{ ...sectionCard, marginTop: 12 }}>
        <Text style={{ color: DairyColors.textSecondary }}>
          {x(`Health Watch (${summary?.date ?? date})`, `सेहत निगरानी (${summary?.date ?? date})`)}
        </Text>
        <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <View style={{ flex: 1, minWidth: 120, borderRadius: 10, padding: 10, backgroundColor: DairyColors.warningSoft }}>
            <Text style={{ color: DairyColors.textSecondary }}>{x("Vaccines Today", "आज के टीके")}</Text>
            <Text style={{ marginTop: 4, fontSize: 18, fontWeight: "800", color: DairyColors.textPrimary }}>
              {summary?.vaccinationsDueToday ?? 0}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 120, borderRadius: 10, padding: 10, backgroundColor: DairyColors.infoSoft }}>
            <Text style={{ color: DairyColors.textSecondary }}>{x("Vaccines Soon", "जल्द वाले टीके")}</Text>
            <Text style={{ marginTop: 4, fontSize: 18, fontWeight: "800", color: DairyColors.textPrimary }}>
              {summary?.vaccinationsDueSoon ?? 0}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 120, borderRadius: 10, padding: 10, backgroundColor: DairyColors.dangerSoft }}>
            <Text style={{ color: DairyColors.textSecondary }}>{x("Vaccines Overdue", "बाकी टीके")}</Text>
            <Text style={{ marginTop: 4, fontSize: 18, fontWeight: "800", color: DairyColors.textPrimary }}>
              {summary?.vaccinationsOverdue ?? 0}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 120, borderRadius: 10, padding: 10, backgroundColor: DairyColors.warningSoft }}>
            <Text style={{ color: DairyColors.textSecondary }}>{x("Deworm Today", "आज की पेट दवा")}</Text>
            <Text style={{ marginTop: 4, fontSize: 18, fontWeight: "800", color: DairyColors.textPrimary }}>
              {summary?.dewormingDueToday ?? 0}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 120, borderRadius: 10, padding: 10, backgroundColor: DairyColors.infoSoft }}>
            <Text style={{ color: DairyColors.textSecondary }}>{x("Deworm Soon", "जल्द वाली पेट दवा")}</Text>
            <Text style={{ marginTop: 4, fontSize: 18, fontWeight: "800", color: DairyColors.textPrimary }}>
              {summary?.dewormingDueSoon ?? 0}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 120, borderRadius: 10, padding: 10, backgroundColor: DairyColors.dangerSoft }}>
            <Text style={{ color: DairyColors.textSecondary }}>{x("Deworm Overdue", "बाकी पेट दवा")}</Text>
            <Text style={{ marginTop: 4, fontSize: 18, fontWeight: "800", color: DairyColors.textPrimary }}>
              {summary?.dewormingOverdue ?? 0}
            </Text>
          </View>
        </View>
      </View>

      <View style={sectionCard}>
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
          {x("Related Records", "संबंधित रिकॉर्ड")}
        </Text>
        <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
          {x(
            "Open breeding, treatment, feed log, and animal profile from here.",
            "यहीं से प्रजनन, ट्रीटमेंट, फीड लॉग और जानवर प्रोफाइल खोलें।"
          )}
        </Text>
        <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Pressable
            disabled={!selectedAnimal}
            onPress={() =>
              selectedAnimal &&
              router.push({
                pathname: "/animals/[animalId]",
                params: { animalId: selectedAnimal.animalId },
              })
            }
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: DairyColors.border,
              backgroundColor: DairyColors.surfaceMuted,
              paddingHorizontal: 12,
              paddingVertical: 9,
            }}
          >
            <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
              {x("Animal Log", "जानवर लॉग")}
            </Text>
          </Pressable>
          {canOpenFeedLog ? (
            <Pressable
              disabled={!selectedAnimal}
              onPress={() =>
                selectedAnimal &&
                router.push({
                  pathname: "/feed",
                  params: { animalId: selectedAnimal.animalId, tag: selectedAnimal.tag },
                })
              }
              style={{
                borderRadius: 10,
                borderWidth: 1,
                borderColor: DairyColors.success,
                backgroundColor: DairyColors.successSoft,
                paddingHorizontal: 12,
                paddingVertical: 9,
              }}
            >
              <Text style={{ color: DairyColors.success, fontWeight: "800" }}>
                {x("Feed Log", "फीड लॉग")}
              </Text>
            </Pressable>
          ) : null}
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
              borderColor: DairyColors.info,
              backgroundColor: DairyColors.infoSoft,
              paddingHorizontal: 12,
              paddingVertical: 9,
            }}
          >
            <Text style={{ color: DairyColors.info, fontWeight: "800" }}>
              {x("Breeding", "प्रजनन")}
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

      <View style={sectionCard}>
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
          {x("Daily Animal Check (SOP)", "रोज़ाना जानवर जांच (SOP)")}
        </Text>
        <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
          {x(
            "Check these once daily for every animal. Mark as attention if any change from normal.",
            "हर जानवर के लिए रोज़ एक बार यह जांचें। सामान्य से बदलाव हो तो ध्यान में लें।"
          )}
        </Text>
        {[
          x("Feed and water intake (drop from normal)", "खाना और पानी की खपत (सामान्य से कमी)"),
          x("Rumination/cud chewing and general alertness", "जुगाली और सामान्य सक्रियता"),
          x("Milk yield and udder/milk abnormalities", "दूध उत्पादन और थन/दूध में असामान्यता"),
          x("Temperature, cough, nasal/eye discharge", "तापमान, खांसी, नाक/आंख से स्राव"),
          x("Dung/urine consistency and frequency", "गोबर/मूत्र की स्थिति और बारंबारता"),
          x("Gait/lameness, hoof and leg condition", "चलना/लंगड़ापन, खुर और पैर की स्थिति"),
          x("Heat signs, pregnancy and calving milestones", "हीट संकेत, गर्भावस्था और बछड़ा चरण"),
        ].map((item, index) => (
          <Text key={`daily-check-${index}`} style={{ marginTop: 6, color: DairyColors.textSecondary }}>
            {`\u2022 ${item}`}
          </Text>
        ))}
      </View>

      {isVetRole ? (
        <View style={sectionCard}>
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
            {x("VET Focus Dashboard", "VET फोकस डैशबोर्ड")}
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x("Clinical alerts from vaccination, deworming, breeding and worklist.", "टीका, पेट दवा, प्रजनन और वर्कलिस्ट से क्लिनिकल अलर्ट।")}
          </Text>
          <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[
              {
                label: x("Total Clinical Tasks", "कुल क्लिनिकल कार्य"),
                value: vetFocusSummary.total,
                color: DairyColors.infoSoft,
              },
              {
                label: x("Overdue", "समय से बाकी"),
                value: vetFocusSummary.overdue,
                color: DairyColors.dangerSoft,
              },
              {
                label: x("Due Today", "आज देय"),
                value: vetFocusSummary.dueToday,
                color: DairyColors.warningSoft,
              },
              {
                label: x("High Priority", "उच्च प्राथमिकता"),
                value: vetFocusSummary.highPriority,
                color: DairyColors.primarySoft,
              },
            ].map((card) => (
              <View
                key={card.label}
                style={{
                  flex: 1,
                  minWidth: 130,
                  borderRadius: 10,
                  padding: 10,
                  backgroundColor: card.color,
                }}
              >
                <Text style={{ color: DairyColors.textSecondary }}>{card.label}</Text>
                <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>
                  {card.value}
                </Text>
              </View>
            ))}
          </View>
          <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Pressable
              onPress={() => setTab("VACCINATION")}
              style={{
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 9,
                backgroundColor: DairyColors.primary,
              }}
            >
              <Text style={{ color: "white", fontWeight: "800" }}>{x("Add Vaccine", "टीका जोड़ें")}</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/treatments",
                  params: selectedAnimal ? { animalId: selectedAnimal.animalId, tag: selectedAnimal.tag } : undefined,
                })
              }
              style={{
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 9,
                backgroundColor: DairyColors.success,
              }}
            >
              <Text style={{ color: "white", fontWeight: "800" }}>{x("Open Treatment", "ट्रीटमेंट खोलें")}</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/breeding",
                  params: selectedAnimal ? { animalId: selectedAnimal.animalId, tag: selectedAnimal.tag } : undefined,
                })
              }
              style={{
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 9,
                backgroundColor: DairyColors.info,
              }}
            >
              <Text style={{ color: "white", fontWeight: "800" }}>{x("Open Breeding", "प्रजनन खोलें")}</Text>
            </Pressable>
          </View>
          <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
            {x(`Due soon (7d): ${vetFocusSummary.dueSoon}`, `7 दिन में देय: ${vetFocusSummary.dueSoon}`)}
          </Text>
        </View>
      ) : null}

      <View style={sectionCard}>
        <Text style={{ fontWeight: "800", color: DairyColors.textPrimary }}>{x("Select Animal", "जानवर चुनें")}</Text>
        <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {animals.length === 0 ? (
            <Text style={{ color: DairyColors.textSecondary }}>{x("No active animals found.", "कोई सक्रिय जानवर नहीं मिला।")}</Text>
          ) : (
            animals.map((animal) => (
              <Pressable
                key={animal.animalId}
                onPress={() => onSelectAnimal(animal.animalId)}
                style={{
                  borderWidth: 1,
                  borderColor: selectedAnimalId === animal.animalId ? DairyColors.primary : DairyColors.border,
                  backgroundColor:
                    selectedAnimalId === animal.animalId ? DairyColors.primarySoft : DairyColors.surface,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{animal.tag}</Text>
              </Pressable>
            ))
          )}
        </View>
      </View>

      <View style={sectionCard}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["VACCINATION", "DEWORMING"] as HealthTab[]).map((entry) => (
            <Pressable
              key={entry}
              onPress={() => setTab(entry)}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: tab === entry ? DairyColors.primary : DairyColors.border,
                backgroundColor: tab === entry ? DairyColors.primarySoft : DairyColors.surface,
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: "center",
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>{tabLabel(entry)}</Text>
            </Pressable>
          ))}
        </View>

        {canManageHealth ? (
          tab === "VACCINATION" ? (
          <View style={{ marginTop: 10 }}>
            <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
              {x("Vaccine (Gov list)", "टीका (सरकारी सूची)")}
            </Text>
            <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {VACCINE_OPTIONS.map((option) => (
                <Pressable
                  key={option.key}
                  onPress={() => onSelectVaccine(option.key)}
                  style={{
                    borderWidth: 1,
                    borderColor: selectedVaccineKey === option.key ? DairyColors.primary : DairyColors.border,
                    backgroundColor: selectedVaccineKey === option.key ? DairyColors.primarySoft : DairyColors.surface,
                    borderRadius: 999,
                    paddingHorizontal: 11,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                    {x(option.labelEn, option.labelHi)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ marginTop: 6, color: DairyColors.textSecondary }}>
              {x(
                "List based on DAHD/NADCP guidance. Use Other only when instructed by vet.",
                "सूची DAHD/NADCP गाइडलाइन पर आधारित है। केवल डॉक्टर सलाह पर Other चुनें।"
              )}
            </Text>
            <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
              {x(
                vaccineByKey(selectedVaccineKey).scheduleHintEn,
                vaccineByKey(selectedVaccineKey).scheduleHintHi
              )}
            </Text>

            {selectedVaccineKey === "OTHER" ? (
              <TextInput
                value={vaccineName}
                onChangeText={setVaccineName}
                placeholder={x("Enter vaccine name", "टीका नाम लिखें")}
                placeholderTextColor="#99A99A"
                editable={canManageHealth}
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
            ) : (
              <Text
                style={{
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  borderRadius: 10,
                  padding: 10,
                  color: DairyColors.textPrimary,
                  backgroundColor: DairyColors.surfaceMuted,
                  fontWeight: "700",
                }}
              >
                {vaccineName}
              </Text>
            )}

            <Text style={{ marginTop: 8, color: DairyColors.textSecondary, fontWeight: "700" }}>
              {x("Disease Target", "बीमारी लक्ष्य")}
            </Text>
            <TextInput
              value={diseaseTarget}
              onChangeText={setDiseaseTarget}
              placeholder={x("Disease target", "बीमारी लक्ष्य")}
              placeholderTextColor="#99A99A"
              editable={canManageHealth && selectedVaccineKey === "OTHER"}
              style={{
                marginTop: 6,
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 10,
                padding: 10,
                color: DairyColors.textPrimary,
                backgroundColor:
                  canManageHealth && selectedVaccineKey === "OTHER"
                    ? DairyColors.surfaceMuted
                    : DairyColors.surface,
              }}
            />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <DateInput
                  value={vDoseDate}
                  onChangeText={onChangeVDoseDate}
                  placeholder={x("Dose Date (YYYY-MM-DD)", "डोज तारीख (YYYY-MM-DD)")}
                  disabled={!canManageHealth}
                />
              </View>
              <TextInput
                value={vDoseNumber}
                onChangeText={setVDoseNumber}
                placeholder={x("Dose #", "डोज #")}
                placeholderTextColor="#99A99A"
                editable={canManageHealth}
                keyboardType="number-pad"
                style={{
                  width: 90,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  borderRadius: 10,
                  padding: 10,
                  color: DairyColors.textPrimary,
                  backgroundColor: DairyColors.surfaceMuted,
                }}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <DateInput
                  value={vNextDueDate}
                  onChangeText={(value) => {
                    setVNextDueDate(value);
                    setNextDueAuto(false);
                  }}
                  placeholder={x("Next Due (YYYY-MM-DD)", "अगली तारीख (YYYY-MM-DD)")}
                  disabled={!canManageHealth}
                />
              </View>
              <Pressable
                disabled={!canManageHealth}
                onPress={() => applyAutoNextDue(selectedVaccineKey, vDoseDate)}
                style={{
                  borderWidth: 1,
                  borderColor: DairyColors.primary,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: DairyColors.primarySoft,
                }}
              >
                <Text style={{ color: DairyColors.primary, fontWeight: "800" }}>{x("Auto", "ऑटो")}</Text>
              </Pressable>
            </View>
            <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
              {nextDueAuto
                ? x("Next shot is auto-set from selected vaccine schedule.", "अगला डोज चुने हुए टीका शेड्यूल से ऑटो सेट है।")
                : x("Next shot can be edited manually.", "अगली तारीख हाथ से बदली जा सकती है।")}
            </Text>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <DateInput
                  value={vBoosterDueDate}
                  onChangeText={setVBoosterDueDate}
                  placeholder={x("Booster (YYYY-MM-DD)", "बूस्टर (YYYY-MM-DD)")}
                  disabled={!canManageHealth}
                />
              </View>
              <View style={{ flex: 1 }}>
                <DateInput
                  value={vaccineExpiryDate}
                  onChangeText={setVaccineExpiryDate}
                  placeholder={x("Expiry (YYYY-MM-DD)", "एक्सपायरी (YYYY-MM-DD)")}
                  disabled={!canManageHealth}
                />
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <TextInput
                value={vBatchLotNo}
                onChangeText={setVBatchLotNo}
                placeholder={x("Batch/Lot", "बैच/लॉट")}
                placeholderTextColor="#99A99A"
                editable={canManageHealth}
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
                value={vRoute}
                onChangeText={setVRoute}
                placeholder={x("Route (IM/SC)", "रूट (IM/SC)")}
                placeholderTextColor="#99A99A"
                editable={canManageHealth}
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
              value={vNotes}
              onChangeText={setVNotes}
              placeholder={x("Notes", "नोट्स")}
              placeholderTextColor="#99A99A"
              editable={canManageHealth}
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

            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              <Pressable
                disabled={savingVaccination || !canManageHealth || !selectedAnimal}
                onPress={saveVaccination}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  backgroundColor:
                    savingVaccination || !canManageHealth || !selectedAnimal
                      ? DairyColors.textSecondary
                      : DairyColors.primary,
                  padding: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "white", fontWeight: "800" }}>
                  {savingVaccination
                    ? x("Saving...", "सेव हो रहा है...")
                    : editingVaccinationId
                      ? x("Update Vaccination", "टीका अपडेट करें")
                      : x("Add Vaccination", "टीका जोड़ें")}
                </Text>
              </Pressable>
              {editingVaccinationId ? (
                <Pressable
                  onPress={resetVaccinationForm}
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
        ) : (
          <View style={{ marginTop: 10 }}>
            <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>{x("Drug Name", "दवा नाम")}</Text>
            <TextInput
              value={dDrugName}
              onChangeText={setDDrugName}
              placeholder={x("Albendazole", "अल्बेंडाजोल")}
              placeholderTextColor="#99A99A"
              editable={canManageHealth}
              style={{
                marginTop: 6,
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 10,
                padding: 10,
                color: DairyColors.textPrimary,
                backgroundColor: DairyColors.surfaceMuted,
              }}
            />

            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <DateInput
                  value={dDoseDate}
                  onChangeText={setDDoseDate}
                  placeholder={x("Dose Date (YYYY-MM-DD)", "डोज तारीख (YYYY-MM-DD)")}
                  disabled={!canManageHealth}
                />
              </View>
              <View style={{ flex: 1 }}>
                <DateInput
                  value={dNextDueDate}
                  onChangeText={setDNextDueDate}
                  placeholder={x("Next Due (YYYY-MM-DD)", "अगली तारीख (YYYY-MM-DD)")}
                  disabled={!canManageHealth}
                />
              </View>
            </View>

            <TextInput
              value={dWeightAtDose}
              onChangeText={setDWeightAtDose}
              placeholder={x("Weight at dose (kg)", "डोज समय वजन (kg)")}
              placeholderTextColor="#99A99A"
              keyboardType="decimal-pad"
              editable={canManageHealth}
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
              value={dNotes}
              onChangeText={setDNotes}
              placeholder={x("Notes", "नोट्स")}
              placeholderTextColor="#99A99A"
              editable={canManageHealth}
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

            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              <Pressable
                disabled={savingDeworming || !canManageHealth || !selectedAnimal}
                onPress={saveDeworming}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  backgroundColor:
                    savingDeworming || !canManageHealth || !selectedAnimal
                      ? DairyColors.textSecondary
                      : DairyColors.primary,
                  padding: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "white", fontWeight: "800" }}>
                  {savingDeworming
                    ? x("Saving...", "सेव हो रहा है...")
                    : editingDewormingId
                      ? x("Update Deworming", "पेट दवा अपडेट करें")
                      : x("Add Deworming", "पेट दवा जोड़ें")}
                </Text>
              </Pressable>
              {editingDewormingId ? (
                <Pressable
                  onPress={resetDewormingForm}
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
          )
        ) : null}
      </View>

      <View style={sectionCard}>
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
          {tab === "VACCINATION"
            ? x(`Vaccination Records (${selectedAnimal?.tag ?? "No animal"})`, `टीका रिकॉर्ड (${selectedAnimal?.tag ?? "जानवर नहीं"})`)
            : x(`Deworming Records (${selectedAnimal?.tag ?? "No animal"})`, `पेट दवा रिकॉर्ड (${selectedAnimal?.tag ?? "जानवर नहीं"})`)}
        </Text>

        <View style={{ marginTop: 8, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {DUE_FILTERS.map((entry) => (
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

        {tab === "VACCINATION" && vaccinations.length === 0 ? (
          <View
            style={{
              marginTop: 8,
              borderWidth: 1,
              borderColor: DairyColors.warning,
              borderRadius: 10,
              backgroundColor: DairyColors.warningSoft,
              padding: 10,
            }}
          >
            <Text style={{ color: DairyColors.warning, fontWeight: "800" }}>
              {x("No vaccination records yet", "अभी तक टीकाकरण रिकॉर्ड नहीं है")}
            </Text>
            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
              {x(
                "Treat this animal as due today and add the first vaccine entry.",
                "इस जानवर को आज देय मानें और पहला टीका रिकॉर्ड जोड़ें।"
              )}
            </Text>
          </View>
        ) : null}

        {tab === "VACCINATION" ? (
          filteredVaccinations.length === 0 ? (
            <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
              {x("No vaccination records for filter.", "इस फिल्टर में कोई टीका रिकॉर्ड नहीं है।")}
            </Text>
        ) : (
          filteredVaccinations.map((row) => {
            const nextDue = resolvedVaccinationNextDue(row);
            const due = dueTone(classifyDue(nextDue, date));
            return (
              <View
                key={row.vaccinationId}
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
                      {row.vaccineName} ({row.diseaseTarget})
                    </Text>
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
                  </View>
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                    {x(`Dose: ${row.doseDate} ${row.doseNumber ? `| #${row.doseNumber}` : ""}`, `डोज: ${row.doseDate} ${row.doseNumber ? `| #${row.doseNumber}` : ""}`)}
                  </Text>
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                    {x(
                      `Next Due: ${nextDue ?? "-"} | Booster: ${row.boosterDueDate ?? "-"}`,
                      `अगली तारीख: ${nextDue ?? "-"} | बूस्टर: ${row.boosterDueDate ?? "-"}`
                    )}
                  </Text>
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                    {x(
                      `Vaccine Expiry: ${row.vaccineExpiryDate ?? "-"}`,
                      `वैक्सीन एक्सपायरी: ${row.vaccineExpiryDate ?? "-"}`
                    )}
                  </Text>

                  {canManageHealth ? (
                    <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
                      <Pressable
                        onPress={() => onEditVaccination(row)}
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
                        onPress={() => onDeleteVaccination(row)}
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
          )
        ) : filteredDeworming.length === 0 ? (
          <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
            {x("No deworming records for filter.", "इस फिल्टर में कोई पेट दवा रिकॉर्ड नहीं है।")}
          </Text>
        ) : (
          filteredDeworming.map((row) => {
            const due = dueTone(classifyDue(row.nextDueDate, date));
            return (
              <View
                key={row.dewormingId}
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
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", flex: 1 }}>{row.drugName}</Text>
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
                </View>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x(`Dose: ${row.doseDate} | Next Due: ${row.nextDueDate ?? "-"}`, `डोज: ${row.doseDate} | अगली तारीख: ${row.nextDueDate ?? "-"}`)}
                </Text>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x(`Weight: ${row.weightAtDoseKg ? `${row.weightAtDoseKg} kg` : "-"}`, `वजन: ${row.weightAtDoseKg ? `${row.weightAtDoseKg} kg` : "-"}`)}
                </Text>

                {canManageHealth ? (
                  <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
                    <Pressable
                      onPress={() => onEditDeworming(row)}
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
                      onPress={() => onDeleteDeworming(row)}
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

      <View style={sectionCard}>
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
          {x(`Health Timeline (${selectedAnimal?.tag ?? "No animal"})`, `सेहत टाइमलाइन (${selectedAnimal?.tag ?? "जानवर नहीं"})`)}
        </Text>
        <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
          {isVetRole
            ? x("Last 30 days: vaccination and deworming", "पिछले 30 दिन: टीका और पेट दवा")
            : x("Last 30 days: milk, vaccination, and deworming", "पिछले 30 दिन: दूध, टीका और पेट दवा")}
        </Text>

        {timeline.length === 0 ? (
          <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>{x("No timeline entries yet.", "अभी टाइमलाइन एंट्री नहीं है।")}</Text>
        ) : (
          timeline.map((event) => {
            const tone = timelineTone(event.kind);
            return (
              <View
                key={event.id}
                style={{
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  borderRadius: 10,
                  padding: 10,
                  backgroundColor: DairyColors.surfaceMuted,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", flex: 1 }}>{event.title}</Text>
                  <View
                    style={{
                      borderRadius: 999,
                      backgroundColor: tone.background,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ color: tone.text, fontWeight: "700" }}>{timelineKindLabel(event.kind)}</Text>
                  </View>
                </View>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>{event.subtitle}</Text>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x(`Date: ${event.date}`, `तारीख: ${event.date}`)}
                </Text>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
