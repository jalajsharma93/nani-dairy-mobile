import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Text, TextInput, View } from "react-native";
import {
  AnimalApi,
  AnimalResponse,
  AuthApi,
  AuthUserResponse,
  FeedManagementApi,
  FeedInventoryForecastResponse,
  FeedInventoryForecastItemResponse,
  FeedProcurementPlanResponse,
  FeedProcurementRunResponse,
  FeedEfficiencyInsightResponse,
  FeedManagementSummaryResponse,
  FeedMaterialCategory,
  FeedMaterialResponse,
  FeedMaterialUnit,
  FeedRationPhase,
  FeedApi,
  FeedLogResponse,
  FeedRecipeResponse,
  FeedSopTaskPriority,
  FeedSopTaskResponse,
  FeedSopTaskStatus,
  UserRole,
} from "@/src/services/api";
import { DairyColors } from "@/src/constants/dairy-theme";
import { todayLocalISO } from "@/src/utils/date";
import { useI18n } from "@/src/state/i18n";
import { useAuth } from "@/src/state/auth";
import { resolveRolePermissions } from "@/src/state/permissions";
import { DateInput } from "../../../components/date-input";
import {
  flushPendingSyncOperations,
  getPendingSyncSummary,
  PendingSyncSummary,
  queueFeedBulkLogCreate,
  queueFeedLogUpdate,
  shouldQueueForOffline,
} from "@/src/utils/offline-sync";

const FEED_TYPES = ["Green Fodder", "Dry Fodder", "Concentrate", "Mineral Mix", "Silage", "Other"];
const RATION_PHASES: FeedRationPhase[] = ["LACTATING", "PREGNANT", "DRY", "CALF", "SICK_RECOVERY"];
const MATERIAL_CATEGORIES: FeedMaterialCategory[] = [
  "GREEN_FODDER",
  "DRY_FODDER",
  "CONCENTRATE",
  "MINERAL",
  "ADDITIVE",
  "OTHER",
];
const MATERIAL_UNITS: FeedMaterialUnit[] = ["KG", "LITER", "BAG", "UNIT"];
const TASK_PRIORITIES: FeedSopTaskPriority[] = ["HIGH", "MEDIUM", "LOW"];
const TASK_STATUSES: FeedSopTaskStatus[] = ["PENDING", "IN_PROGRESS", "DONE"];
const TASK_ASSIGNEES: UserRole[] = ["WORKER", "FEED_MANAGER", "MANAGER"];
const TASK_FILTER_ALL = "__ALL__";
const TASK_FILTER_MINE = "__MINE__";
const TASK_FILTER_UNASSIGNED = "__UNASSIGNED__";
type FeedEntryMode = "PER_COW" | "GROUP" | "ALL_ACTIVE";

const kg = (value: number) => `${value.toFixed(2)} kg`;

function inferRationPhase(animal?: AnimalResponse | null): FeedRationPhase {
  if (!animal) {
    return "DRY";
  }
  if (animal.status === "LACTATING") {
    return "LACTATING";
  }
  if (animal.status === "SICK") {
    return "SICK_RECOVERY";
  }
  return "DRY";
}

export default function FeedScreen() {
  const params = useLocalSearchParams<{ animalId?: string; tag?: string }>();
  const { user } = useAuth();
  const { x, t } = useI18n();
  const permissions = resolveRolePermissions(user?.role);
  const canAddFeed = permissions.canAddFeed;
  const canEditFeed = permissions.canEditFeed;
  const canManageFeedManagement = permissions.canManageFeedManagement;
  const canUpdateTaskStatus = permissions.canUpdateFeedTaskStatus;
  const canManageAllFeedTasks = permissions.canManageAllFeedTasks;
  const isAdminFeed = permissions.isAdmin;
  const isManagerSupervisorFeed = permissions.isManager || permissions.isFeedManager;
  const isWorkerChecklistOnly = permissions.isWorker && !canManageFeedManagement;
  const [date, setDate] = useState(todayLocalISO());
  const [animals, setAnimals] = useState<AnimalResponse[]>([]);
  const [logs, setLogs] = useState<FeedLogResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loadingManagement, setLoadingManagement] = useState(false);
  const [savingManagement, setSavingManagement] = useState(false);
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

  const [editingFeedLogId, setEditingFeedLogId] = useState<string | null>(null);
  const [feedDate, setFeedDate] = useState(todayLocalISO());
  const [feedEntryMode, setFeedEntryMode] = useState<FeedEntryMode>("PER_COW");
  const [animalId, setAnimalId] = useState("");
  const [groupPhase, setGroupPhase] = useState<FeedRationPhase>("LACTATING");
  const [feedType, setFeedType] = useState(FEED_TYPES[0]);
  const [rationPhase, setRationPhase] = useState<FeedRationPhase>("DRY");
  const [quantityKg, setQuantityKg] = useState("");
  const [notes, setNotes] = useState("");

  const [filterAnimalId, setFilterAnimalId] = useState("");
  const [managementSummary, setManagementSummary] = useState<FeedManagementSummaryResponse | null>(null);
  const [inventoryForecast, setInventoryForecast] = useState<FeedInventoryForecastResponse | null>(null);
  const [procurementPlan, setProcurementPlan] = useState<FeedProcurementPlanResponse | null>(null);
  const [procurementRuns, setProcurementRuns] = useState<FeedProcurementRunResponse[]>([]);
  const [feedEfficiency, setFeedEfficiency] = useState<FeedEfficiencyInsightResponse | null>(null);
  const [forecastLookbackDays, setForecastLookbackDays] = useState<30 | 90>(30);
  const [procurementHorizonDays, setProcurementHorizonDays] = useState<30 | 90>(30);
  const [materials, setMaterials] = useState<FeedMaterialResponse[]>([]);
  const [recipes, setRecipes] = useState<FeedRecipeResponse[]>([]);
  const [tasks, setTasks] = useState<FeedSopTaskResponse[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<AuthUserResponse[]>([]);
  const [generatingProcurementTasks, setGeneratingProcurementTasks] = useState(false);

  const [materialName, setMaterialName] = useState("");
  const [materialCategory, setMaterialCategory] = useState<FeedMaterialCategory>("GREEN_FODDER");
  const [materialUnit, setMaterialUnit] = useState<FeedMaterialUnit>("KG");
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [materialQty, setMaterialQty] = useState("");
  const [materialReorderQty, setMaterialReorderQty] = useState("");
  const [materialCost, setMaterialCost] = useState("");
  const [materialSupplier, setMaterialSupplier] = useState("");
  const [materialNotes, setMaterialNotes] = useState("");
  const [stockAdjustMaterialId, setStockAdjustMaterialId] = useState<string>("");
  const [stockAdjustQty, setStockAdjustQty] = useState("");
  const [stockAdjustReason, setStockAdjustReason] = useState("");

  const [recipeName, setRecipeName] = useState("");
  const [recipePhase, setRecipePhase] = useState<FeedRationPhase>("LACTATING");
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [recipeTargetCount, setRecipeTargetCount] = useState("");
  const [recipeIngredients, setRecipeIngredients] = useState("");
  const [recipeInstructions, setRecipeInstructions] = useState("");

  const [taskDate, setTaskDate] = useState(todayLocalISO());
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDetails, setTaskDetails] = useState("");
  const [taskPriority, setTaskPriority] = useState<FeedSopTaskPriority>("MEDIUM");
  const [taskAssignedRole, setTaskAssignedRole] = useState<UserRole>("WORKER");
  const [taskAssignedToUsername, setTaskAssignedToUsername] = useState("");
  const [taskFilterRole, setTaskFilterRole] = useState<UserRole | "ALL">("ALL");
  const [taskFilterAssignee, setTaskFilterAssignee] = useState<string>(TASK_FILTER_ALL);
  const [taskDueTime, setTaskDueTime] = useState("");

  const feedTypeLabel = (type: string) => {
    if (type === "Green Fodder") return x("Green Fodder", "हरा चारा");
    if (type === "Dry Fodder") return x("Dry Fodder", "सूखा चारा");
    if (type === "Concentrate") return x("Concentrate", "कंसंट्रेट");
    if (type === "Mineral Mix") return x("Mineral Mix", "मिनरल मिक्स");
    if (type === "Silage") return x("Silage", "साइलेज");
    if (type === "Other") return x("Other", "अन्य");
    return type;
  };

  const rationPhaseLabel = (phase: FeedRationPhase) => {
    if (phase === "LACTATING") return x("Lactating", "दूध देने वाली");
    if (phase === "PREGNANT") return x("Pregnant", "गर्भावस्था");
    if (phase === "DRY") return x("Dry", "सूखा");
    if (phase === "CALF") return x("Calf", "बछड़ा");
    return x("Sick Recovery", "बीमारी से रिकवरी");
  };

  const materialCategoryLabel = (category: FeedMaterialCategory) => {
    if (category === "GREEN_FODDER") return x("Green Fodder", "हरा चारा");
    if (category === "DRY_FODDER") return x("Dry Fodder", "सूखा चारा");
    if (category === "CONCENTRATE") return x("Concentrate", "कंसंट्रेट");
    if (category === "MINERAL") return x("Mineral", "मिनरल");
    if (category === "ADDITIVE") return x("Additive", "एडिटिव");
    return x("Other", "अन्य");
  };

  const unitLabel = (unit: FeedMaterialUnit) => {
    if (unit === "LITER") return x("Liter", "लीटर");
    if (unit === "BAG") return x("Bag", "बैग");
    if (unit === "UNIT") return x("Unit", "पीस");
    return x("Kg", "किलो");
  };

  const taskPriorityLabel = (priority: FeedSopTaskPriority) => {
    if (priority === "HIGH") return x("High", "उच्च");
    if (priority === "LOW") return x("Low", "कम");
    return x("Medium", "मध्यम");
  };

  const taskStatusLabel = (status: FeedSopTaskStatus) => {
    if (status === "PENDING") return x("Pending", "पेंडिंग");
    if (status === "IN_PROGRESS") return x("In Progress", "चालू");
    return x("Done", "पूरा");
  };

  const roleLabel = (role: UserRole) => {
    if (role === "FEED_MANAGER") return x("Feed Manager", "फीड मैनेजर");
    if (role === "MANAGER") return x("Manager", "मैनेजर");
    return x("Worker", "कर्मचारी");
  };

  const efficiencyTrendLabel = (trend: FeedEfficiencyInsightResponse["herdTrend"]) => {
    if (trend === "IMPROVING") return x("Improving", "सुधर रहा");
    if (trend === "DECLINING") return x("Declining", "गिर रहा");
    if (trend === "STABLE") return x("Stable", "स्थिर");
    return x("Insufficient Data", "डाटा कम");
  };

  const animalPhase = useCallback((animal: AnimalResponse): FeedRationPhase => {
    if (animal.growthStage === "CALF") {
      return "CALF";
    }
    if (animal.status === "LACTATING") {
      return "LACTATING";
    }
    if (animal.status === "SICK") {
      return "SICK_RECOVERY";
    }
    return "DRY";
  }, []);

  const matchesGroupPhase = useCallback((animal: AnimalResponse, phase: FeedRationPhase) => {
    if (phase === "PREGNANT") {
      return animal.status === "DRY" && animal.growthStage !== "CALF";
    }
    return animalPhase(animal) === phase;
  }, [animalPhase]);

  const animalMap = useMemo(() => {
    const map = new Map<string, AnimalResponse>();
    animals.forEach((a) => map.set(a.animalId, a));
    return map;
  }, [animals]);

  const targetAnimalsForEntry = useMemo(() => {
    if (feedEntryMode === "PER_COW") {
      return animals.filter((a) => a.animalId === animalId);
    }
    if (feedEntryMode === "GROUP") {
      return animals.filter((a) => matchesGroupPhase(a, groupPhase));
    }
    return animals;
  }, [animalId, animals, feedEntryMode, groupPhase, matchesGroupPhase]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [animalList, feedLogs] = await Promise.all([
        AnimalApi.list({ active: true }),
        FeedApi.list({ date, animalId: filterAnimalId || undefined }),
      ]);
      setAnimals(animalList);
      setLogs(feedLogs);
      if (!animalId && animalList.length > 0) {
        setAnimalId(animalList[0].animalId);
        setRationPhase(inferRationPhase(animalList[0]));
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load feed logs.", "चारा रिकॉर्ड लोड नहीं हो पाया।")
      );
    } finally {
      setLoading(false);
    }
  };

  const loadManagement = async () => {
    try {
      setLoadingManagement(true);
      const [summaryRes, forecastRes, procurementRes, procurementRunsRes, efficiencyRes, materialRows, recipeRows, taskRows, userRows] =
        await Promise.all([
        FeedManagementApi.summary(date),
        FeedManagementApi.forecast(date, forecastLookbackDays),
        FeedManagementApi.procurementPlan(date, forecastLookbackDays, procurementHorizonDays),
        FeedManagementApi.procurementTaskRuns(10),
        FeedManagementApi.efficiency(date, forecastLookbackDays),
        FeedManagementApi.listMaterials(),
        FeedManagementApi.listRecipes({ activeOnly: true }),
        FeedManagementApi.listTasks({ date }),
        canManageFeedManagement ? AuthApi.listAssignableUsers(TASK_ASSIGNEES) : Promise.resolve([] as AuthUserResponse[]),
      ]);
      setManagementSummary(summaryRes);
      setInventoryForecast(forecastRes);
      setProcurementPlan(procurementRes);
      setProcurementRuns(procurementRunsRes);
      setFeedEfficiency(efficiencyRes);
      setMaterials(materialRows);
      setRecipes(recipeRows);
      setTasks(taskRows);
      setAssignableUsers(userRows);
      if (!stockAdjustMaterialId && materialRows.length > 0) {
        setStockAdjustMaterialId(materialRows[0].feedMaterialId);
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load feed management data.", "फीड मैनेजमेंट डेटा लोड नहीं हुआ।")
      );
    } finally {
      setLoadingManagement(false);
    }
  };

  const refreshPendingSync = useCallback(async () => {
    setPendingSync(await getPendingSyncSummary());
  }, []);

  useEffect(() => {
    loadData();
    loadManagement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, filterAnimalId, user?.username, canManageFeedManagement, forecastLookbackDays, procurementHorizonDays]);

  useEffect(() => {
    void refreshPendingSync();
  }, [refreshPendingSync]);

  useEffect(() => {
    const requestedAnimalIdRaw = Array.isArray(params.animalId) ? params.animalId[0] : params.animalId;
    const requestedTagRaw = Array.isArray(params.tag) ? params.tag[0] : params.tag;
    const requestedAnimalId = (requestedAnimalIdRaw ?? "").trim().toLowerCase();
    const requestedTag = (requestedTagRaw ?? "").trim().toLowerCase();
    if (!animals.length || (!requestedAnimalId && !requestedTag)) {
      return;
    }

    const matched =
      animals.find((row) => row.animalId.toLowerCase() === requestedAnimalId) ??
      animals.find((row) => row.tag.toLowerCase() === requestedTag);
    if (!matched) {
      return;
    }

    if (filterAnimalId !== matched.animalId) {
      setFilterAnimalId(matched.animalId);
    }
    if (!animalId) {
      setAnimalId(matched.animalId);
      setRationPhase(inferRationPhase(matched));
    }
  }, [animalId, animals, filterAnimalId, params.animalId, params.tag]);

  const resetForm = () => {
    setEditingFeedLogId(null);
    setFeedDate(date);
    setFeedEntryMode("PER_COW");
    setAnimalId(animals[0]?.animalId ?? "");
    setGroupPhase("LACTATING");
    setRationPhase(inferRationPhase(animals[0] ?? null));
    setFeedType(FEED_TYPES[0]);
    setQuantityKg("");
    setNotes("");
  };

  const saveFeedLog = async () => {
    if (editingFeedLogId && !canEditFeed) {
      Alert.alert(
        x("Role restricted", "रोल अनुमति नहीं"),
        x(
          "Only ADMIN, MANAGER, or FEED_MANAGER users can edit feed logs.",
          "चारा रिकॉर्ड बदलना सिर्फ ADMIN, MANAGER या FEED_MANAGER कर सकता है।"
        )
      );
      return;
    }
    if (!editingFeedLogId && !canAddFeed) {
      Alert.alert(x("Role restricted", "रोल अनुमति नहीं"), t("common.manageRestricted"));
      return;
    }

    const quantity = Number(quantityKg);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      Alert.alert(
        x("Invalid quantity", "गलत मात्रा"),
        x("Quantity must be a positive number.", "मात्रा पॉजिटिव संख्या होनी चाहिए।")
      );
      return;
    }

    try {
      setSaving(true);
      if (editingFeedLogId) {
        if (!animalId) {
          Alert.alert(x("Missing details", "जानकारी अधूरी"), x("Select an animal.", "कृपया जानवर चुनें।"));
          return;
        }
        const payload = {
          feedDate,
          animalId,
          feedType,
          rationPhase,
          quantityKg: quantity,
          notes: notes.trim() || null,
        };
        await FeedApi.update(editingFeedLogId, payload);
      } else {
        const targets = targetAnimalsForEntry;
        if (targets.length === 0) {
          Alert.alert(
            x("No animals found", "कोई जानवर नहीं मिला"),
            x("No animals match this feed mode.", "इस फीड मोड के लिए कोई जानवर नहीं मिला।")
          );
          return;
        }
        const quantityPerAnimal = feedEntryMode === "PER_COW" ? quantity : quantity / targets.length;
        if (!Number.isFinite(quantityPerAnimal) || quantityPerAnimal <= 0) {
          Alert.alert(
            x("Invalid quantity", "गलत मात्रा"),
            x("Per-animal quantity must be positive.", "प्रति जानवर मात्रा पॉजिटिव होनी चाहिए।")
          );
          return;
        }

        const createPayloads = targets.map((target) => ({
          feedDate,
          animalId: target.animalId,
          feedType,
          rationPhase: feedEntryMode === "GROUP" ? groupPhase : animalPhase(target),
          quantityKg: quantityPerAnimal,
          notes: notes.trim() || null,
        }));
        await Promise.all(createPayloads.map((payload) => FeedApi.create(payload)));
      }

      resetForm();
      await loadData();
      Alert.alert(
        x("Saved", "सेव हो गया"),
        editingFeedLogId
          ? x("Feed log updated.", "चारा रिकॉर्ड अपडेट हुआ।")
          : feedEntryMode === "PER_COW"
            ? x("Feed log added.", "चारा रिकॉर्ड जोड़ दिया गया।")
            : x(
                `Feed logged for ${targetAnimalsForEntry.length} animals.`,
                `${targetAnimalsForEntry.length} जानवरों के लिए फीड रिकॉर्ड जोड़ दिया गया।`
              )
      );
    } catch (e: any) {
      console.error(e);
      if (shouldQueueForOffline(e)) {
        try {
          let queued = false;
          if (editingFeedLogId && animalId) {
            const payload = {
              feedDate,
              animalId,
              feedType,
              rationPhase,
              quantityKg: quantity,
              notes: notes.trim() || null,
            };
            await queueFeedLogUpdate(editingFeedLogId, payload, String(e?.message ?? ""));
            queued = true;
          } else {
            const targets = targetAnimalsForEntry;
            if (targets.length > 0) {
              const quantityPerAnimal = feedEntryMode === "PER_COW" ? quantity : quantity / targets.length;
              if (Number.isFinite(quantityPerAnimal) && quantityPerAnimal > 0) {
                const createPayloads = targets.map((target) => ({
                  feedDate,
                  animalId: target.animalId,
                  feedType,
                  rationPhase: feedEntryMode === "GROUP" ? groupPhase : animalPhase(target),
                  quantityKg: quantityPerAnimal,
                  notes: notes.trim() || null,
                }));
                await queueFeedBulkLogCreate(createPayloads, String(e?.message ?? ""));
                queued = true;
              }
            }
          }
          if (queued) {
            resetForm();
            await refreshPendingSync();
            Alert.alert(
              x("Saved Offline", "ऑफलाइन सेव"),
              x(
                "Network unavailable. Feed save is queued and will sync automatically.",
                "नेटवर्क उपलब्ध नहीं है। फीड सेव कतार में है और अपने-आप सिंक होगा।"
              )
            );
            return;
          }
        } catch (queueError) {
          console.error(queueError);
        }
      }
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not save feed log.", "चारा रिकॉर्ड सेव नहीं हो पाया।")
      );
    } finally {
      setSaving(false);
    }
  };

  const saveMaterial = async () => {
    if (!canManageFeedManagement) {
      Alert.alert(x("Role restricted", "रोल अनुमति नहीं"), t("common.manageRestricted"));
      return;
    }
    if (!materialName.trim()) {
      Alert.alert(
        x("Missing details", "जानकारी अधूरी"),
        x("Material name is required.", "कच्चे माल का नाम जरूरी है।")
      );
      return;
    }
    const qty = Number(materialQty);
    const reorder = Number(materialReorderQty);
    const cost = materialCost.trim() ? Number(materialCost) : null;
    if (!Number.isFinite(qty) || qty < 0 || !Number.isFinite(reorder) || reorder < 0) {
      Alert.alert(
        x("Invalid values", "गलत मान"),
        x("Available and reorder quantity must be 0 or more.", "उपलब्ध और रीऑर्डर मात्रा 0 या उससे अधिक हो।")
      );
      return;
    }
    if (cost != null && (!Number.isFinite(cost) || cost < 0)) {
      Alert.alert(
        x("Invalid values", "गलत मान"),
        x("Cost per unit must be a positive number.", "प्रति यूनिट लागत सही संख्या होनी चाहिए।")
      );
      return;
    }

    try {
      setSavingManagement(true);
      const payload = {
        materialName: materialName.trim(),
        category: materialCategory,
        unit: materialUnit,
        availableQty: qty,
        reorderLevelQty: reorder,
        costPerUnit: cost,
        supplierName: materialSupplier.trim() || null,
        notes: materialNotes.trim() || null,
      };
      if (editingMaterialId) {
        await FeedManagementApi.updateMaterial(editingMaterialId, payload);
      } else {
        await FeedManagementApi.createMaterial(payload);
      }
      const actionText = editingMaterialId ? x("Raw material updated.", "कच्चा माल अपडेट हो गया।") : x("Raw material added.", "कच्चा माल जोड़ दिया गया।");
      setEditingMaterialId(null);
      setMaterialName("");
      setMaterialQty("");
      setMaterialReorderQty("");
      setMaterialCost("");
      setMaterialSupplier("");
      setMaterialNotes("");
      await loadManagement();
      Alert.alert(x("Saved", "सेव हो गया"), actionText);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not add raw material.", "कच्चा माल जोड़ नहीं पाया।")
      );
    } finally {
      setSavingManagement(false);
    }
  };

  const adjustStock = async () => {
    if (!canManageFeedManagement) {
      Alert.alert(x("Role restricted", "रोल अनुमति नहीं"), t("common.manageRestricted"));
      return;
    }
    if (!stockAdjustMaterialId) {
      Alert.alert(
        x("Missing details", "जानकारी अधूरी"),
        x("Select a material for stock adjust.", "स्टॉक बदलने के लिए सामग्री चुनें।")
      );
      return;
    }
    const delta = Number(stockAdjustQty);
    if (!Number.isFinite(delta) || delta === 0) {
      Alert.alert(
        x("Invalid values", "गलत मान"),
        x("Stock delta cannot be 0.", "स्टॉक बदलाव 0 नहीं हो सकता।")
      );
      return;
    }
    try {
      setSavingManagement(true);
      await FeedManagementApi.adjustMaterial(stockAdjustMaterialId, {
        quantityDelta: delta,
        reason: stockAdjustReason.trim() || null,
      });
      setStockAdjustQty("");
      setStockAdjustReason("");
      await loadManagement();
      Alert.alert(x("Saved", "सेव हो गया"), x("Stock updated.", "स्टॉक अपडेट हो गया।"));
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not adjust stock.", "स्टॉक अपडेट नहीं हुआ।")
      );
    } finally {
      setSavingManagement(false);
    }
  };

  const saveRecipe = async () => {
    if (!canManageFeedManagement) {
      Alert.alert(x("Role restricted", "रोल अनुमति नहीं"), t("common.manageRestricted"));
      return;
    }
    if (!recipeName.trim() || !recipeIngredients.trim()) {
      Alert.alert(
        x("Missing details", "जानकारी अधूरी"),
        x("Recipe name and ingredients are required.", "रेसिपी नाम और सामग्री जरूरी है।")
      );
      return;
    }
    const targetCount = recipeTargetCount.trim() ? Number(recipeTargetCount) : null;
    if (targetCount != null && (!Number.isFinite(targetCount) || targetCount < 0)) {
      Alert.alert(
        x("Invalid values", "गलत मान"),
        x("Target animals must be 0 or more.", "टारगेट जानवर 0 या उससे ज्यादा हों।")
      );
      return;
    }
    try {
      setSavingManagement(true);
      const payload = {
        recipeName: recipeName.trim(),
        rationPhase: recipePhase,
        targetAnimalCount: targetCount,
        ingredients: recipeIngredients.trim(),
        instructions: recipeInstructions.trim() || null,
        active: true,
      };
      if (editingRecipeId) {
        await FeedManagementApi.updateRecipe(editingRecipeId, { ...payload, active: true });
      } else {
        await FeedManagementApi.createRecipe(payload);
      }
      const actionText = editingRecipeId ? x("Recipe updated.", "रेसिपी अपडेट हो गई।") : x("Recipe saved.", "रेसिपी सेव हो गई।");
      setEditingRecipeId(null);
      setRecipeName("");
      setRecipeTargetCount("");
      setRecipeIngredients("");
      setRecipeInstructions("");
      await loadManagement();
      Alert.alert(x("Saved", "सेव हो गया"), actionText);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not save recipe.", "रेसिपी सेव नहीं हुई।")
      );
    } finally {
      setSavingManagement(false);
    }
  };

  const saveTask = async () => {
    if (!canManageFeedManagement) {
      Alert.alert(x("Role restricted", "रोल अनुमति नहीं"), t("common.manageRestricted"));
      return;
    }
    if (!taskTitle.trim()) {
      Alert.alert(x("Missing details", "जानकारी अधूरी"), x("Task title is required.", "टास्क का नाम जरूरी है।"));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(taskDate)) {
      Alert.alert(x("Invalid date", "गलत तारीख"), x("Use date format YYYY-MM-DD.", "तारीख फॉर्मेट YYYY-MM-DD रखें।"));
      return;
    }
    if (taskDueTime.trim() && !/^\d{2}:\d{2}$/.test(taskDueTime.trim())) {
      Alert.alert(x("Invalid time", "गलत समय"), x("Use time format HH:MM.", "समय फॉर्मेट HH:MM रखें।"));
      return;
    }
    try {
      setSavingManagement(true);
      await FeedManagementApi.createTask({
        taskDate,
        title: taskTitle.trim(),
        details: taskDetails.trim() || null,
        assignedRole: taskAssignedRole,
        assignedToUsername: taskAssignedToUsername || null,
        priority: taskPriority,
        dueTime: taskDueTime.trim() || null,
      });
      setTaskTitle("");
      setTaskDetails("");
      setTaskDueTime("");
      setTaskAssignedToUsername("");
      await loadManagement();
      Alert.alert(x("Saved", "सेव हो गया"), x("SOP task added.", "SOP टास्क जोड़ दिया गया।"));
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not add SOP task.", "SOP टास्क जोड़ नहीं पाया।")
      );
    } finally {
      setSavingManagement(false);
    }
  };

  const generateProcurementTasks = async () => {
    if (!canManageFeedManagement) {
      Alert.alert(x("Role restricted", "रोल अनुमति नहीं"), t("common.manageRestricted"));
      return;
    }
    try {
      setGeneratingProcurementTasks(true);
      const result = await FeedManagementApi.generateProcurementTasks({
        date,
        taskDate: date,
        lookbackDays: forecastLookbackDays,
        horizonDays: procurementHorizonDays,
      });
      await loadManagement();
      Alert.alert(
        x("Procurement tasks generated", "खरीद टास्क बन गए"),
        x(
          `${result.runMode ?? "MANUAL"} run ${result.feedProcurementRunId ?? "-"} | Created ${result.createdTasks}, skipped ${result.skippedTasks} duplicate tasks.`,
          `${result.runMode ?? "MANUAL"} रन ${result.feedProcurementRunId ?? "-"} | ${result.createdTasks} नए टास्क बने, ${result.skippedTasks} डुप्लिकेट टास्क छोड़े गए।`
        )
      );
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Action failed", "क्रिया असफल"),
        e?.message ?? x("Could not generate procurement tasks.", "खरीद टास्क नहीं बन पाए।")
      );
    } finally {
      setGeneratingProcurementTasks(false);
    }
  };

  const updateTaskStatus = async (taskId: string, status: FeedSopTaskStatus) => {
    if (!canUpdateTaskStatus) {
      return;
    }
    const task = tasks.find((row) => row.feedTaskId === taskId) ?? null;
    if (task && !canActOnFeedTask(task)) {
      Alert.alert(
        x("Not allowed", "अनुमति नहीं"),
        x("You can update only your assigned feed tasks.", "आप केवल अपने असाइन किए गए फीड टास्क अपडेट कर सकते हैं।")
      );
      return;
    }
    try {
      await FeedManagementApi.updateTaskStatus(taskId, { status });
      await loadManagement();
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not update task status.", "टास्क स्टेटस अपडेट नहीं हुआ।")
      );
    }
  };

  const startEditMaterial = (material: FeedMaterialResponse) => {
    if (!canManageFeedManagement) {
      return;
    }
    setEditingMaterialId(material.feedMaterialId);
    setMaterialName(material.materialName);
    setMaterialCategory(material.category);
    setMaterialUnit(material.unit);
    setMaterialQty(String(material.availableQty));
    setMaterialReorderQty(String(material.reorderLevelQty));
    setMaterialCost(material.costPerUnit != null ? String(material.costPerUnit) : "");
    setMaterialSupplier(material.supplierName ?? "");
    setMaterialNotes(material.notes ?? "");
  };

  const resetMaterialForm = () => {
    setEditingMaterialId(null);
    setMaterialName("");
    setMaterialCategory("GREEN_FODDER");
    setMaterialUnit("KG");
    setMaterialQty("");
    setMaterialReorderQty("");
    setMaterialCost("");
    setMaterialSupplier("");
    setMaterialNotes("");
  };

  const startEditRecipe = (recipe: FeedRecipeResponse) => {
    if (!canManageFeedManagement) {
      return;
    }
    setEditingRecipeId(recipe.feedRecipeId);
    setRecipeName(recipe.recipeName);
    setRecipePhase(recipe.rationPhase);
    setRecipeTargetCount(recipe.targetAnimalCount != null ? String(recipe.targetAnimalCount) : "");
    setRecipeIngredients(recipe.ingredients);
    setRecipeInstructions(recipe.instructions ?? "");
  };

  const resetRecipeForm = () => {
    setEditingRecipeId(null);
    setRecipeName("");
    setRecipePhase("LACTATING");
    setRecipeTargetCount("");
    setRecipeIngredients("");
    setRecipeInstructions("");
  };

  const startEdit = (log: FeedLogResponse) => {
    if (!canEditFeed) {
      return;
    }
    setEditingFeedLogId(log.feedLogId);
    setFeedEntryMode("PER_COW");
    setFeedDate(log.feedDate);
    setAnimalId(log.animalId);
    setFeedType(log.feedType);
    setRationPhase(log.rationPhase ?? inferRationPhase(animalMap.get(log.animalId) ?? null));
    setQuantityKg(String(log.quantityKg));
    setNotes(log.notes ?? "");
  };

  const summary = useMemo(() => {
    const totalKg = logs.reduce((sum, log) => sum + log.quantityKg, 0);
    const uniqueAnimals = new Set(logs.map((l) => l.animalId)).size;

    const byAnimal = new Map<string, number>();
    logs.forEach((log) => {
      byAnimal.set(log.animalId, (byAnimal.get(log.animalId) ?? 0) + log.quantityKg);
    });

    let topAnimalId = "";
    let topQuantity = 0;
    byAnimal.forEach((value, key) => {
      if (value > topQuantity) {
        topQuantity = value;
        topAnimalId = key;
      }
    });

    const byPhase = new Map<FeedRationPhase, number>();
    logs.forEach((log) => {
      const phase = (log.rationPhase ?? inferRationPhase(animalMap.get(log.animalId) ?? null)) as FeedRationPhase;
      byPhase.set(phase, (byPhase.get(phase) ?? 0) + log.quantityKg);
    });

    return {
      totalKg,
      uniqueAnimals,
      entries: logs.length,
      topAnimalId,
      topQuantity,
      byPhase,
    };
  }, [animalMap, logs]);

  const forecastByMaterialId = useMemo(() => {
    const map = new Map<string, FeedInventoryForecastItemResponse>();
    (inventoryForecast?.items ?? []).forEach((row) => map.set(row.feedMaterialId, row));
    return map;
  }, [inventoryForecast]);

  const topEfficiencyActions = useMemo(() => {
    if (!feedEfficiency) {
      return [];
    }
    return feedEfficiency.items
      .filter((row) => row.efficiencyBand === "INEFFICIENT" || row.efficiencyBand === "WATCH")
      .slice(0, 5);
  }, [feedEfficiency]);

  const procurementTopItems = useMemo(() => (procurementPlan?.items ?? []).slice(0, 6), [procurementPlan]);

  const procurementTopSupplierGroups = useMemo(
    () => (procurementPlan?.supplierGroups ?? []).slice(0, 4),
    [procurementPlan]
  );

  const latestProcurementRun = useMemo(
    () => (procurementRuns.length > 0 ? procurementRuns[0] : null),
    [procurementRuns]
  );

  const usersForSelectedTaskRole = useMemo(
    () =>
      assignableUsers
        .filter((row) => row.role === taskAssignedRole && row.active)
        .sort((a, b) => a.username.localeCompare(b.username)),
    [assignableUsers, taskAssignedRole]
  );

  const taskFilterUsers = useMemo(() => {
    const rows = assignableUsers.filter((row) => row.active);
    if (taskFilterRole === "ALL") {
      return rows.sort((a, b) => a.username.localeCompare(b.username));
    }
    return rows
      .filter((row) => row.role === taskFilterRole)
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [assignableUsers, taskFilterRole]);

  useEffect(() => {
    if (!taskAssignedToUsername) {
      return;
    }
    const stillPresent = usersForSelectedTaskRole.some((row) => row.username === taskAssignedToUsername);
    if (!stillPresent) {
      setTaskAssignedToUsername("");
    }
  }, [taskAssignedToUsername, usersForSelectedTaskRole]);

  useEffect(() => {
    if (taskFilterAssignee === TASK_FILTER_ALL || taskFilterAssignee === TASK_FILTER_MINE || taskFilterAssignee === TASK_FILTER_UNASSIGNED) {
      return;
    }
    const stillPresent = taskFilterUsers.some((row) => row.username === taskFilterAssignee);
    if (!stillPresent) {
      setTaskFilterAssignee(TASK_FILTER_ALL);
    }
  }, [taskFilterAssignee, taskFilterUsers]);

  const visibleTasks = useMemo(() => {
    let rows = [...tasks];
    if (!isWorkerChecklistOnly) {
      if (taskFilterRole !== "ALL") {
        rows = rows.filter((task) => task.assignedRole === taskFilterRole);
      }
      if (taskFilterAssignee === TASK_FILTER_MINE) {
        const me = (user?.username ?? "").toLowerCase();
        rows = rows.filter((task) => (task.assignedToUsername ?? "").toLowerCase() === me);
      } else if (taskFilterAssignee === TASK_FILTER_UNASSIGNED) {
        rows = rows.filter((task) => !task.assignedToUsername);
      } else if (taskFilterAssignee !== TASK_FILTER_ALL) {
        rows = rows.filter(
          (task) => (task.assignedToUsername ?? "").toLowerCase() === taskFilterAssignee.toLowerCase()
        );
      }
    }
    return rows.sort((a, b) => (a.dueTime ?? "").localeCompare(b.dueTime ?? ""));
  }, [isWorkerChecklistOnly, taskFilterAssignee, taskFilterRole, tasks, user?.username]);

  const canActOnFeedTask = useCallback(
    (task: FeedSopTaskResponse) => {
      if (!canUpdateTaskStatus || !user) {
        return false;
      }
      if (canManageAllFeedTasks) {
        return true;
      }
      const me = user.username.trim().toLowerCase();
      const assignee = (task.assignedToUsername ?? "").trim().toLowerCase();
      if (assignee) {
        return assignee === me;
      }
      return task.assignedRole === user.role;
    },
    [canManageAllFeedTasks, canUpdateTaskStatus, user]
  );

  const workerChecklistTasks = useMemo(
    () => visibleTasks.filter((task) => task.assignedRole === "WORKER" && canActOnFeedTask(task)),
    [canActOnFeedTask, visibleTasks]
  );

  const preparationTasks = useMemo(
    () => visibleTasks.filter((task) => task.status !== "DONE"),
    [visibleTasks]
  );

  const refreshAll = async () => {
    await Promise.all([loadData(), loadManagement()]);
  };

  const syncPending = async () => {
    try {
      setSyncing(true);
      const result = await flushPendingSyncOperations();
      await refreshPendingSync();
      await refreshAll();
      if (result.processed === 0) {
        Alert.alert(x("No pending sync", "कोई पेंडिंग सिंक नहीं"), x("All operations are already synced.", "सभी ऑपरेशन पहले से सिंक हैं।"));
        return;
      }
      Alert.alert(
        x("Sync complete", "सिंक पूरा"),
        x(
          `Processed ${result.processed} | Synced ${result.success} | Remaining ${result.remaining}`,
          `प्रोसेस ${result.processed} | सिंक ${result.success} | बाकी ${result.remaining}`
        )
      );
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Sync failed", "सिंक असफल"),
        e?.message ?? x("Could not sync pending operations.", "पेंडिंग ऑपरेशन सिंक नहीं हुए।")
      );
    } finally {
      setSyncing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: DairyColors.background }}>
      <FlatList
        data={logs}
        keyExtractor={(log) => log.feedLogId}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListHeaderComponent={
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
                  {x("Feed Monitoring", "चारा मॉनिटरिंग")}
                </Text>
                <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                  {x("Cow intake and feed quality logs", "गाय का खाना और चारा गुणवत्ता रिकॉर्ड")}
                </Text>
              </View>
              <Pressable
                onPress={refreshAll}
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

            <DateInput
              value={date}
              onChangeText={setDate}
              placeholder={x("Date (YYYY-MM-DD)", "तारीख (YYYY-MM-DD)")}
            />

            <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Pressable
                onPress={() => setFilterAnimalId("")}
                style={{
                  borderWidth: 1,
                  borderColor: filterAnimalId === "" ? DairyColors.primary : DairyColors.border,
                  backgroundColor: filterAnimalId === "" ? DairyColors.primarySoft : DairyColors.surface,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{x("All Cows", "सभी गाय")}</Text>
              </Pressable>
              {animals.slice(0, 8).map((a) => (
                <Pressable
                  key={a.animalId}
                  onPress={() => setFilterAnimalId(a.animalId)}
                  style={{
                    borderWidth: 1,
                    borderColor: filterAnimalId === a.animalId ? DairyColors.primary : DairyColors.border,
                    backgroundColor: filterAnimalId === a.animalId ? DairyColors.primarySoft : DairyColors.surface,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                  }}
                >
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{a.tag}</Text>
                </Pressable>
              ))}
            </View>

            <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <View style={{ flex: 1, minWidth: 120, borderRadius: 12, padding: 10, backgroundColor: DairyColors.accentSoft }}>
                <Text style={{ color: DairyColors.textSecondary }}>{x("Total Intake", "कुल खुराक")}</Text>
                <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>{kg(summary.totalKg)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 120, borderRadius: 12, padding: 10, backgroundColor: DairyColors.infoSoft }}>
                <Text style={{ color: DairyColors.textSecondary }}>{x("Animals Fed", "खाना दिए जानवर")}</Text>
                <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>{summary.uniqueAnimals}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 120, borderRadius: 12, padding: 10, backgroundColor: DairyColors.successSoft }}>
                <Text style={{ color: DairyColors.textSecondary }}>{x("Top Intake", "सबसे ज्यादा खुराक")}</Text>
                <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>
                  {summary.topAnimalId ? `${animalMap.get(summary.topAnimalId)?.tag ?? summary.topAnimalId} (${kg(summary.topQuantity)})` : "-"}
                </Text>
              </View>
            </View>

            <View
              style={{
                marginTop: 10,
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 12,
                backgroundColor: pendingSync.feedBulkCreate + pendingSync.feedLogUpdate > 0 ? DairyColors.warningSoft : DairyColors.successSoft,
                padding: 10,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                {pendingSync.feedBulkCreate + pendingSync.feedLogUpdate > 0
                  ? x("Feed Sync Pending", "फीड सिंक बाकी")
                  : x("Feed Synced", "फीड सिंक")}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x(
                  `Create pending ${pendingSync.feedBulkCreate} | Update pending ${pendingSync.feedLogUpdate} | Dead letter ${pendingSync.deadLetter}`,
                  `नया रिकॉर्ड बाकी ${pendingSync.feedBulkCreate} | अपडेट बाकी ${pendingSync.feedLogUpdate} | डेड लेटर ${pendingSync.deadLetter}`
                )}
              </Text>
              <Pressable
                onPress={() => void syncPending()}
                disabled={syncing}
                style={{
                  marginTop: 8,
                  alignSelf: "flex-start",
                  borderRadius: 10,
                  backgroundColor: syncing ? DairyColors.textSecondary : DairyColors.primary,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: "white", fontWeight: "800" }}>
                  {syncing ? x("Syncing...", "सिंक हो रहा है...") : x("Sync Pending Now", "अभी सिंक करें")}
                </Text>
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
                {x("Ration by Animal Stage", "जानवर चरण के हिसाब से राशन")}
              </Text>
              <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                {x(
                  "Track feed by phase: lactating, pregnant, dry, calf, and recovery.",
                  "खुराक को चरण अनुसार ट्रैक करें: दूध देने वाली, गर्भावस्था, सूखा, बछड़ा, रिकवरी।"
                )}
              </Text>
              <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {RATION_PHASES.map((phase) => (
                  <View
                    key={phase}
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      backgroundColor: DairyColors.surfaceMuted,
                    }}
                  >
                    <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                      {rationPhaseLabel(phase)}: {kg(summary.byPhase.get(phase) ?? 0)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View
              style={{
                marginTop: 12,
                borderRadius: 12,
                backgroundColor: DairyColors.infoSoft,
                borderWidth: 1,
                borderColor: DairyColors.info,
                padding: 10,
              }}
            >
              <Text style={{ color: DairyColors.info, fontWeight: "800" }}>
                {x("Practical Feeding Guide", "व्यवहारिक फीडिंग गाइड")}
              </Text>
              <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                {x("Lactating: higher energy/protein with balanced roughage.", "दूध देने वाली: ज्यादा ऊर्जा/प्रोटीन, संतुलित रफेज के साथ।")}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x("Pregnant (last weeks): controlled energy, mineral support.", "गर्भावस्था (अंतिम हफ्ते): नियंत्रित ऊर्जा, मिनरल सपोर्ट।")}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x("Dry: fiber-rich diet, avoid overfeeding concentrate.", "सूखा: रेशेदार आहार, कंसंट्रेट ज़्यादा न दें।")}
              </Text>
            </View>

            {canAddFeed ? (
              <View
                style={{
                  marginTop: 14,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  borderRadius: 14,
                  padding: 12,
                  backgroundColor: DairyColors.surface,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
                  {editingFeedLogId ? x("Edit Feed Log", "चारा रिकॉर्ड बदलें") : x("Add Feed Log", "चारा रिकॉर्ड जोड़ें")}
                </Text>

              <DateInput
                value={feedDate}
                onChangeText={setFeedDate}
                placeholder={x("Feed date (YYYY-MM-DD)", "चारा तारीख (YYYY-MM-DD)")}
              />

              {!editingFeedLogId ? (
                <>
                  <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                    {x("Entry Mode", "एंट्री मोड")}
                  </Text>
                  <View style={{ marginTop: 6, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    {([
                      { key: "PER_COW", labelEn: "Per Cow", labelHi: "प्रति गाय" },
                      { key: "GROUP", labelEn: "Group", labelHi: "समूह" },
                      { key: "ALL_ACTIVE", labelEn: "All Active", labelHi: "सभी सक्रिय" },
                    ] as { key: FeedEntryMode; labelEn: string; labelHi: string }[]).map((mode) => (
                      <Pressable
                        key={mode.key}
                        onPress={() => setFeedEntryMode(mode.key)}
                        style={{
                          borderWidth: 1,
                          borderColor: feedEntryMode === mode.key ? DairyColors.primary : DairyColors.border,
                          backgroundColor: feedEntryMode === mode.key ? DairyColors.primarySoft : DairyColors.surface,
                          borderRadius: 999,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                        }}
                      >
                        <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                          {x(mode.labelEn, mode.labelHi)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              {editingFeedLogId || feedEntryMode === "PER_COW" ? (
                <>
                  <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                    {x("Select Cow", "गाय चुनें")}
                  </Text>
                  <View style={{ marginTop: 6, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    {animals.slice(0, 10).map((a) => (
                      <Pressable
                        key={a.animalId}
                        onPress={() => {
                          setAnimalId(a.animalId);
                          if (!editingFeedLogId) {
                            setRationPhase(inferRationPhase(a));
                          }
                        }}
                        style={{
                          borderWidth: 1,
                          borderColor: animalId === a.animalId ? DairyColors.primary : DairyColors.border,
                          backgroundColor: animalId === a.animalId ? DairyColors.primarySoft : DairyColors.surface,
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 7,
                        }}
                      >
                        <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{a.tag}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              {!editingFeedLogId && feedEntryMode === "GROUP" ? (
                <>
                  <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                    {x("Group Type", "समूह प्रकार")}
                  </Text>
                  <View style={{ marginTop: 6, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    {RATION_PHASES.map((phase) => (
                      <Pressable
                        key={phase}
                        onPress={() => setGroupPhase(phase)}
                        style={{
                          borderWidth: 1,
                          borderColor: groupPhase === phase ? DairyColors.primary : DairyColors.border,
                          backgroundColor: groupPhase === phase ? DairyColors.primarySoft : DairyColors.surface,
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 7,
                        }}
                      >
                        <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{rationPhaseLabel(phase)}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={{ marginTop: 6, color: DairyColors.textSecondary }}>
                    {x(
                      `Targets: ${targetAnimalsForEntry.length} animals`,
                      `लक्ष्य: ${targetAnimalsForEntry.length} जानवर`
                    )}
                  </Text>
                </>
              ) : null}

              {!editingFeedLogId && feedEntryMode === "ALL_ACTIVE" ? (
                <Text style={{ marginTop: 10, color: DairyColors.textSecondary }}>
                  {x(
                    `This will create feed logs for all active animals (${targetAnimalsForEntry.length}).`,
                    `यह सभी सक्रिय जानवरों (${targetAnimalsForEntry.length}) के लिए फीड एंट्री बनाएगा।`
                  )}
                </Text>
              ) : null}

              <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                {x("Feed Type", "चारा प्रकार")}
              </Text>
              <View style={{ marginTop: 6, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {FEED_TYPES.map((type) => (
                  <Pressable
                    key={type}
                    onPress={() => setFeedType(type)}
                    style={{
                      borderWidth: 1,
                      borderColor: feedType === type ? DairyColors.primary : DairyColors.border,
                      backgroundColor: feedType === type ? DairyColors.primarySoft : DairyColors.surface,
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                    }}
                  >
                    <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{feedTypeLabel(type)}</Text>
                  </Pressable>
                ))}
              </View>

              {editingFeedLogId || feedEntryMode === "PER_COW" ? (
                <>
                  <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                    {x("Ration Phase", "राशन चरण")}
                  </Text>
                  <View style={{ marginTop: 6, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    {RATION_PHASES.map((phase) => (
                      <Pressable
                        key={phase}
                        onPress={() => setRationPhase(phase)}
                        style={{
                          borderWidth: 1,
                          borderColor: rationPhase === phase ? DairyColors.primary : DairyColors.border,
                          backgroundColor: rationPhase === phase ? DairyColors.primarySoft : DairyColors.surface,
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 7,
                        }}
                      >
                        <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{rationPhaseLabel(phase)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              <TextInput
                value={quantityKg}
                onChangeText={setQuantityKg}
                placeholder={
                  editingFeedLogId || feedEntryMode === "PER_COW"
                    ? x("Quantity per cow (kg)", "प्रति गाय मात्रा (kg)")
                    : x("Total batch quantity (kg)", "कुल बैच मात्रा (kg)")
                }
                placeholderTextColor="#99A99A"
                keyboardType="decimal-pad"
                style={{
                  marginTop: 10,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  borderRadius: 10,
                  padding: 10,
                  color: DairyColors.textPrimary,
                  backgroundColor: DairyColors.surfaceMuted,
                }}
              />
              {!editingFeedLogId && feedEntryMode !== "PER_COW" ? (
                <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                  {x(
                    "Total quantity will be split equally across selected animals.",
                    "कुल मात्रा चुने गए जानवरों में बराबर बांटी जाएगी।"
                  )}
                </Text>
              ) : null}

              <TextInput
                value={notes}
                onChangeText={setNotes}
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
                onPress={saveFeedLog}
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: saving ? DairyColors.textSecondary : DairyColors.primary,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "white", fontWeight: "800" }}>
                  {saving
                    ? x("Saving...", "सेव हो रहा है...")
                    : editingFeedLogId
                      ? x("Update Feed Log", "चारा रिकॉर्ड अपडेट करें")
                      : x("Add Feed Log", "चारा रिकॉर्ड जोड़ें")}
                </Text>
              </Pressable>

                {editingFeedLogId ? (
                  <Pressable
                    onPress={resetForm}
                    style={{
                      marginTop: 8,
                      padding: 10,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: DairyColors.border,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>{x("Cancel Edit", "बदलाव रद्द करें")}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <Text style={{ marginTop: 14, marginBottom: 8, color: DairyColors.textSecondary, fontWeight: "700" }}>
              {x(`Feed Logs (${date})`, `चारा रिकॉर्ड (${date})`)}
            </Text>
          </>
        }
        renderItem={({ item }) => (
          <View
            style={{
              borderWidth: 1,
              borderColor: DairyColors.border,
              borderRadius: 12,
              backgroundColor: DairyColors.surface,
              padding: 10,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                {animalMap.get(item.animalId)?.tag ?? item.animalId}
              </Text>
              <Text style={{ color: DairyColors.textSecondary }}>{item.feedDate}</Text>
            </View>
            <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
              {feedTypeLabel(item.feedType)} | {rationPhaseLabel((item.rationPhase ?? inferRationPhase(animalMap.get(item.animalId) ?? null)) as FeedRationPhase)} | {kg(item.quantityKg)}
            </Text>
            {item.notes ? (
              <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                {x(`Note: ${item.notes}`, `नोट: ${item.notes}`)}
              </Text>
            ) : null}

            {canEditFeed ? (
              <Pressable
                onPress={() => startEdit(item)}
                style={{
                  marginTop: 8,
                  alignSelf: "flex-start",
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: DairyColors.surfaceMuted,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{x("Edit", "बदलें")}</Text>
              </Pressable>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ marginTop: 10, color: DairyColors.textSecondary }}>
            {loading
              ? x("Loading feed logs...", "चारा रिकॉर्ड लोड हो रहे हैं...")
              : x("No feed logs found for selected filters.", "चुने हुए फिल्टर में कोई चारा रिकॉर्ड नहीं मिला।")}
          </Text>
        }
        ListFooterComponent={
          <View style={{ marginTop: 16 }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 14,
                backgroundColor: DairyColors.surface,
                padding: 12,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>
                {x("Feed Management (Raw Material + SOP)", "फीड मैनेजमेंट (कच्चा माल + SOP)")}
              </Text>
              <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                {x(
                  "Track stock, create daily ration recipe, and run feed-room tasks.",
                  "स्टॉक ट्रैक करें, रोज की रेशन रेसिपी बनाएं और फीड-रूम टास्क चलाएं।"
                )}
              </Text>

              <View
                style={{
                  marginTop: 8,
                  borderRadius: 10,
                  backgroundColor: DairyColors.infoSoft,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: DairyColors.info, fontWeight: "700" }}>
                  {isWorkerChecklistOnly
                    ? x("Worker View: checklist only. Mark tasks done.", "वर्कर व्यू: सिर्फ चेकलिस्ट। टास्क पूरा करें।")
                    : isManagerSupervisorFeed
                      ? x(
                          "Manager/Supervisor View: preparation plan, materials, recipes, and SOP control.",
                          "मैनेजर/सुपरवाइजर व्यू: तैयारी योजना, सामग्री, रेसिपी और SOP नियंत्रण।"
                        )
                      : x(
                          "Admin View: full monitoring and edit controls.",
                          "एडमिन व्यू: पूरी मॉनिटरिंग और एडिट कंट्रोल।"
                        )}
                </Text>
              </View>

              {!isWorkerChecklistOnly ? (
                <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <View style={{ borderRadius: 10, backgroundColor: DairyColors.accentSoft, padding: 8, minWidth: 130 }}>
                    <Text style={{ color: DairyColors.textSecondary }}>{x("Materials", "कच्चा माल")}</Text>
                    <Text style={{ marginTop: 2, color: DairyColors.textPrimary, fontWeight: "800" }}>
                      {managementSummary ? managementSummary.totalMaterials : loadingManagement ? "..." : "0"}
                    </Text>
                  </View>
                  <View style={{ borderRadius: 10, backgroundColor: DairyColors.warningSoft, padding: 8, minWidth: 130 }}>
                    <Text style={{ color: DairyColors.textSecondary }}>{x("Low Stock", "कम स्टॉक")}</Text>
                    <Text style={{ marginTop: 2, color: DairyColors.textPrimary, fontWeight: "800" }}>
                      {managementSummary ? managementSummary.lowStockMaterials : loadingManagement ? "..." : "0"}
                    </Text>
                  </View>
                  <View style={{ borderRadius: 10, backgroundColor: DairyColors.infoSoft, padding: 8, minWidth: 130 }}>
                    <Text style={{ color: DairyColors.textSecondary }}>{x("Open Tasks", "खुले टास्क")}</Text>
                    <Text style={{ marginTop: 2, color: DairyColors.textPrimary, fontWeight: "800" }}>
                      {managementSummary ? managementSummary.openTasks : loadingManagement ? "..." : "0"}
                    </Text>
                  </View>
                </View>
              ) : null}

              {!isWorkerChecklistOnly ? (
                <>
                  <View
                    style={{
                      marginTop: 12,
                      borderWidth: 1,
                      borderColor: DairyColors.border,
                      borderRadius: 12,
                      backgroundColor: DairyColors.surfaceMuted,
                      padding: 10,
                    }}
                  >
                    <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                      {x("Feed vs Yield Intelligence", "फीड बनाम दूध विश्लेषण")}
                    </Text>
                    <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                      {feedEfficiency
                        ? x(
                            `Window ${feedEfficiency.fromDate} to ${feedEfficiency.date} | Herd trend ${efficiencyTrendLabel(
                              feedEfficiency.herdTrend
                            )}`,
                            `अवधि ${feedEfficiency.fromDate} से ${feedEfficiency.date} | झुंड ट्रेंड ${efficiencyTrendLabel(
                              feedEfficiency.herdTrend
                            )}`
                          )
                        : loadingManagement
                          ? x("Efficiency insights loading...", "इंसाइट लोड हो रही हैं...")
                          : x("Efficiency insights unavailable.", "इंसाइट उपलब्ध नहीं हैं।")}
                    </Text>

                    <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      <View style={{ borderRadius: 10, backgroundColor: DairyColors.dangerSoft, padding: 8, minWidth: 120 }}>
                        <Text style={{ color: DairyColors.textSecondary }}>{x("Inefficient", "अप्रभावी")}</Text>
                        <Text style={{ marginTop: 2, color: DairyColors.textPrimary, fontWeight: "800" }}>
                          {feedEfficiency ? feedEfficiency.inefficientAnimals : loadingManagement ? "..." : "0"}
                        </Text>
                      </View>
                      <View style={{ borderRadius: 10, backgroundColor: DairyColors.warningSoft, padding: 8, minWidth: 120 }}>
                        <Text style={{ color: DairyColors.textSecondary }}>{x("Watch", "नजर रखें")}</Text>
                        <Text style={{ marginTop: 2, color: DairyColors.textPrimary, fontWeight: "800" }}>
                          {feedEfficiency ? feedEfficiency.watchAnimals : loadingManagement ? "..." : "0"}
                        </Text>
                      </View>
                      <View style={{ borderRadius: 10, backgroundColor: DairyColors.infoSoft, padding: 8, minWidth: 120 }}>
                        <Text style={{ color: DairyColors.textSecondary }}>{x("Data Gap", "डाटा गैप")}</Text>
                        <Text style={{ marginTop: 2, color: DairyColors.textPrimary, fontWeight: "800" }}>
                          {feedEfficiency ? feedEfficiency.dataGapAnimals : loadingManagement ? "..." : "0"}
                        </Text>
                      </View>
                      <View style={{ borderRadius: 10, backgroundColor: DairyColors.successSoft, padding: 8, minWidth: 170 }}>
                        <Text style={{ color: DairyColors.textSecondary }}>{x("Potential 30d Savings", "संभावित 30-दिन बचत")}</Text>
                        <Text style={{ marginTop: 2, color: DairyColors.textPrimary, fontWeight: "800" }}>
                          {feedEfficiency
                            ? `${feedEfficiency.potentialFeedSavingsKg30Days.toFixed(2)} kg`
                            : loadingManagement
                              ? "..."
                              : "0.00 kg"}
                        </Text>
                        <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                          {feedEfficiency
                            ? `Rs ${feedEfficiency.potentialFeedCostSavings30Days.toFixed(2)}`
                            : loadingManagement
                              ? "..."
                              : "Rs 0.00"}
                        </Text>
                      </View>
                    </View>

                    {topEfficiencyActions.length > 0 ? (
                      <View style={{ marginTop: 8, gap: 6 }}>
                        {topEfficiencyActions.map((row) => {
                          const bandColor =
                            row.efficiencyBand === "INEFFICIENT"
                              ? DairyColors.danger
                              : row.efficiencyBand === "WATCH"
                                ? DairyColors.warning
                                : DairyColors.info;
                          const bandSoft =
                            row.efficiencyBand === "INEFFICIENT"
                              ? DairyColors.dangerSoft
                              : row.efficiencyBand === "WATCH"
                                ? DairyColors.warningSoft
                                : DairyColors.infoSoft;
                          return (
                            <View
                              key={`eff-${row.animalId}`}
                              style={{
                                borderWidth: 1,
                                borderColor: DairyColors.border,
                                borderRadius: 10,
                                backgroundColor: DairyColors.surface,
                                padding: 9,
                              }}
                            >
                              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                                  {(row.tag ?? "").trim() || row.animalId}
                                </Text>
                                <View
                                  style={{
                                    borderRadius: 999,
                                    backgroundColor: bandSoft,
                                    paddingHorizontal: 10,
                                    paddingVertical: 4,
                                  }}
                                >
                                  <Text style={{ color: bandColor, fontWeight: "700" }}>{row.efficiencyBand}</Text>
                                </View>
                              </View>
                              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                                {x(
                                  `Feed ${row.totalFeedKg.toFixed(2)} kg | Milk ${row.totalMilkLiters.toFixed(
                                    2
                                  )} L | Feed/L ${
                                    row.feedPerLiter == null ? "-" : row.feedPerLiter.toFixed(3)
                                  }`,
                                  `चारा ${row.totalFeedKg.toFixed(2)} किलो | दूध ${row.totalMilkLiters.toFixed(
                                    2
                                  )} लीटर | चारा/लीटर ${
                                    row.feedPerLiter == null ? "-" : row.feedPerLiter.toFixed(3)
                                  }`
                                )}
                              </Text>
                              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>{row.recommendation}</Text>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>

                  <View
                    style={{
                      marginTop: 12,
                      borderWidth: 1,
                      borderColor: DairyColors.border,
                      borderRadius: 12,
                      backgroundColor: DairyColors.surfaceMuted,
                      padding: 10,
                    }}
                  >
                    <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                      {x("Inventory Forecast (30/90 day)", "इन्वेंट्री फोरकास्ट (30/90 दिन)")}
                    </Text>
                    <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                      {inventoryForecast
                        ? x(
                            `Lookback ${inventoryForecast.lookbackDays} days | Daily usage ${inventoryForecast.estimatedDailyConsumptionTotalKg.toFixed(2)} kg`,
                            `पिछले ${inventoryForecast.lookbackDays} दिन | दैनिक खपत ${inventoryForecast.estimatedDailyConsumptionTotalKg.toFixed(2)} किलो`
                          )
                        : loadingManagement
                          ? x("Forecast loading...", "फोरकास्ट लोड हो रहा है...")
                          : x("Forecast unavailable.", "फोरकास्ट उपलब्ध नहीं है।")}
                    </Text>

                    <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
                      {[30, 90].map((days) => (
                        <Pressable
                          key={`forecast-lookback-${days}`}
                          onPress={() => setForecastLookbackDays(days as 30 | 90)}
                          style={{
                            borderWidth: 1,
                            borderColor:
                              forecastLookbackDays === days ? DairyColors.primary : DairyColors.border,
                            backgroundColor:
                              forecastLookbackDays === days ? DairyColors.primarySoft : DairyColors.surface,
                            borderRadius: 999,
                            paddingHorizontal: 12,
                            paddingVertical: 7,
                          }}
                        >
                          <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                            {x(`${days} day lookback`, `${days} दिन आधार`)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      <View style={{ borderRadius: 10, backgroundColor: DairyColors.dangerSoft, padding: 8, minWidth: 120 }}>
                        <Text style={{ color: DairyColors.textSecondary }}>{x("High Risk", "उच्च जोखिम")}</Text>
                        <Text style={{ marginTop: 2, color: DairyColors.textPrimary, fontWeight: "800" }}>
                          {inventoryForecast ? inventoryForecast.highRiskMaterials : loadingManagement ? "..." : "0"}
                        </Text>
                      </View>
                      <View style={{ borderRadius: 10, backgroundColor: DairyColors.warningSoft, padding: 8, minWidth: 120 }}>
                        <Text style={{ color: DairyColors.textSecondary }}>{x("Medium Risk", "मध्यम जोखिम")}</Text>
                        <Text style={{ marginTop: 2, color: DairyColors.textPrimary, fontWeight: "800" }}>
                          {inventoryForecast ? inventoryForecast.mediumRiskMaterials : loadingManagement ? "..." : "0"}
                        </Text>
                      </View>
                      <View style={{ borderRadius: 10, backgroundColor: DairyColors.accentSoft, padding: 8, minWidth: 150 }}>
                        <Text style={{ color: DairyColors.textSecondary }}>{x("30-day Reorder Cost", "30-दिन रीऑर्डर लागत")}</Text>
                        <Text style={{ marginTop: 2, color: DairyColors.textPrimary, fontWeight: "800" }}>
                          {inventoryForecast
                            ? `Rs ${inventoryForecast.totalRecommendedReorderCost30Days.toFixed(2)}`
                            : loadingManagement
                              ? "..."
                              : "Rs 0.00"}
                        </Text>
                      </View>
                      <View style={{ borderRadius: 10, backgroundColor: DairyColors.infoSoft, padding: 8, minWidth: 150 }}>
                        <Text style={{ color: DairyColors.textSecondary }}>{x("90-day Reorder Cost", "90-दिन रीऑर्डर लागत")}</Text>
                        <Text style={{ marginTop: 2, color: DairyColors.textPrimary, fontWeight: "800" }}>
                          {inventoryForecast
                            ? `Rs ${inventoryForecast.totalRecommendedReorderCost90Days.toFixed(2)}`
                            : loadingManagement
                              ? "..."
                              : "Rs 0.00"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View
                    style={{
                      marginTop: 12,
                      borderWidth: 1,
                      borderColor: DairyColors.border,
                      borderRadius: 12,
                      backgroundColor: DairyColors.surfaceMuted,
                      padding: 10,
                    }}
                  >
                    <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                      {x("Procurement Planner", "खरीद योजना")}
                    </Text>
                    <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                      {procurementPlan
                        ? x(
                            `Horizon ${procurementPlan.horizonDays} days | Planned items ${procurementPlan.itemsPlanned}`,
                            `${procurementPlan.horizonDays} दिन लक्ष्य | कुल आइटम ${procurementPlan.itemsPlanned}`
                          )
                        : loadingManagement
                          ? x("Loading procurement plan...", "खरीद योजना लोड हो रही है...")
                          : x("Procurement plan unavailable.", "खरीद योजना उपलब्ध नहीं है।")}
                    </Text>

                    <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
                      {[30, 90].map((days) => (
                        <Pressable
                          key={`procurement-horizon-${days}`}
                          onPress={() => setProcurementHorizonDays(days as 30 | 90)}
                          style={{
                            borderWidth: 1,
                            borderColor:
                              procurementHorizonDays === days ? DairyColors.primary : DairyColors.border,
                            backgroundColor:
                              procurementHorizonDays === days ? DairyColors.primarySoft : DairyColors.surface,
                            borderRadius: 999,
                            paddingHorizontal: 12,
                            paddingVertical: 7,
                          }}
                        >
                          <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                            {x(`${days} day target`, `${days} दिन लक्ष्य`)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      <View style={{ borderRadius: 10, backgroundColor: DairyColors.dangerSoft, padding: 8, minWidth: 120 }}>
                        <Text style={{ color: DairyColors.textSecondary }}>{x("High Urgency", "उच्च प्राथमिकता")}</Text>
                        <Text style={{ marginTop: 2, color: DairyColors.textPrimary, fontWeight: "800" }}>
                          {procurementPlan ? procurementPlan.highUrgencyItems : loadingManagement ? "..." : "0"}
                        </Text>
                      </View>
                      <View style={{ borderRadius: 10, backgroundColor: DairyColors.warningSoft, padding: 8, minWidth: 120 }}>
                        <Text style={{ color: DairyColors.textSecondary }}>{x("Medium Urgency", "मध्यम प्राथमिकता")}</Text>
                        <Text style={{ marginTop: 2, color: DairyColors.textPrimary, fontWeight: "800" }}>
                          {procurementPlan ? procurementPlan.mediumUrgencyItems : loadingManagement ? "..." : "0"}
                        </Text>
                      </View>
                      <View style={{ borderRadius: 10, backgroundColor: DairyColors.infoSoft, padding: 8, minWidth: 120 }}>
                        <Text style={{ color: DairyColors.textSecondary }}>{x("Low Urgency", "कम प्राथमिकता")}</Text>
                        <Text style={{ marginTop: 2, color: DairyColors.textPrimary, fontWeight: "800" }}>
                          {procurementPlan ? procurementPlan.lowUrgencyItems : loadingManagement ? "..." : "0"}
                        </Text>
                      </View>
                      <View style={{ borderRadius: 10, backgroundColor: DairyColors.accentSoft, padding: 8, minWidth: 170 }}>
                        <Text style={{ color: DairyColors.textSecondary }}>{x("Estimated Procurement", "अनुमानित खरीद")}</Text>
                        <Text style={{ marginTop: 2, color: DairyColors.textPrimary, fontWeight: "800" }}>
                          {procurementPlan
                            ? procurementPlan.totalEstimatedCost != null
                              ? `Rs ${procurementPlan.totalEstimatedCost.toFixed(2)}`
                              : x("Cost unavailable", "लागत उपलब्ध नहीं")
                            : loadingManagement
                              ? "..."
                              : "Rs 0.00"}
                        </Text>
                      </View>
                    </View>

                    {latestProcurementRun ? (
                      <View
                        style={{
                          marginTop: 8,
                          borderWidth: 1,
                          borderColor: DairyColors.border,
                          borderRadius: 10,
                          backgroundColor:
                            latestProcurementRun.runMode === "AUTOMATED"
                              ? DairyColors.infoSoft
                              : DairyColors.surface,
                          padding: 9,
                        }}
                      >
                        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                          {x("Latest Procurement Run", "नवीनतम खरीद रन")}
                        </Text>
                        <Text style={{ marginTop: 3, color: DairyColors.textSecondary }}>
                          {x(
                            `${latestProcurementRun.runMode} | Created ${latestProcurementRun.createdTasks} | Skipped ${latestProcurementRun.skippedTasks} | Considered ${latestProcurementRun.consideredItems}`,
                            `${latestProcurementRun.runMode} | बने ${latestProcurementRun.createdTasks} | छोड़े ${latestProcurementRun.skippedTasks} | विचारित ${latestProcurementRun.consideredItems}`
                          )}
                        </Text>
                        <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                          {x(
                            `Actor ${latestProcurementRun.actor ?? "-"} | Time ${latestProcurementRun.createdAt ? latestProcurementRun.createdAt.replace("T", " ").slice(0, 16) : "-"}`,
                            `Actor ${latestProcurementRun.actor ?? "-"} | समय ${latestProcurementRun.createdAt ? latestProcurementRun.createdAt.replace("T", " ").slice(0, 16) : "-"}`
                          )}
                        </Text>
                      </View>
                    ) : null}

                    {procurementTopItems.length > 0 ? (
                      <View style={{ marginTop: 8, gap: 6 }}>
                        {procurementTopItems.map((row) => {
                          const urgencyColor =
                            row.urgencyLevel === "HIGH"
                              ? DairyColors.danger
                              : row.urgencyLevel === "MEDIUM"
                                ? DairyColors.warning
                                : DairyColors.info;
                          const urgencySoft =
                            row.urgencyLevel === "HIGH"
                              ? DairyColors.dangerSoft
                              : row.urgencyLevel === "MEDIUM"
                                ? DairyColors.warningSoft
                                : DairyColors.infoSoft;
                          return (
                            <View
                              key={`proc-item-${row.feedMaterialId}`}
                              style={{
                                borderWidth: 1,
                                borderColor: DairyColors.border,
                                borderRadius: 10,
                                backgroundColor: DairyColors.surface,
                                padding: 9,
                              }}
                            >
                              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                                  #{row.rank} {row.materialName}
                                </Text>
                                <View
                                  style={{
                                    borderRadius: 999,
                                    backgroundColor: urgencySoft,
                                    paddingHorizontal: 10,
                                    paddingVertical: 4,
                                  }}
                                >
                                  <Text style={{ color: urgencyColor, fontWeight: "700" }}>
                                    {row.urgencyLevel}
                                  </Text>
                                </View>
                              </View>
                              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                                {x(
                                  `${row.recommendedOrderQty.toFixed(2)} ${unitLabel(row.unit)} | Supplier ${row.supplierName}`,
                                  `${row.recommendedOrderQty.toFixed(2)} ${unitLabel(row.unit)} | सप्लायर ${row.supplierName}`
                                )}
                              </Text>
                              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                                {x(
                                  `Order by ${row.suggestedOrderByDate ?? "-"} | Score ${row.urgencyScore}`,
                                  `${row.suggestedOrderByDate ?? "-"} तक ऑर्डर | स्कोर ${row.urgencyScore}`
                                )}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
                        {loadingManagement
                          ? x("Loading items...", "आइटम लोड हो रहे हैं...")
                          : x("No procurement items for selected horizon.", "चुने गए समय के लिए खरीद आइटम नहीं हैं।")}
                      </Text>
                    )}

                    {procurementTopSupplierGroups.length > 0 ? (
                      <>
                        <Text style={{ marginTop: 8, color: DairyColors.textSecondary, fontWeight: "700" }}>
                          {x("Top Supplier Buckets", "मुख्य सप्लायर समूह")}
                        </Text>
                        {procurementTopSupplierGroups.map((group) => (
                          <View
                            key={`proc-supplier-${group.supplierName}`}
                            style={{
                              marginTop: 6,
                              borderWidth: 1,
                              borderColor: DairyColors.border,
                              borderRadius: 10,
                              backgroundColor: DairyColors.surface,
                              padding: 8,
                            }}
                          >
                            <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{group.supplierName}</Text>
                            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                              {x(
                                `Items ${group.itemsCount} | Qty ${group.totalRecommendedQty.toFixed(2)} | Cost ${
                                  group.totalEstimatedCost != null ? `Rs ${group.totalEstimatedCost.toFixed(2)}` : "NA"
                                }`,
                                `आइटम ${group.itemsCount} | मात्रा ${group.totalRecommendedQty.toFixed(2)} | लागत ${
                                  group.totalEstimatedCost != null ? `Rs ${group.totalEstimatedCost.toFixed(2)}` : "NA"
                                }`
                              )}
                            </Text>
                          </View>
                        ))}
                      </>
                    ) : null}

                    {canManageFeedManagement ? (
                      <Pressable
                        onPress={generateProcurementTasks}
                        disabled={generatingProcurementTasks}
                        style={{
                          marginTop: 10,
                          borderRadius: 10,
                          backgroundColor: generatingProcurementTasks
                            ? DairyColors.primarySoft
                            : DairyColors.primary,
                          paddingVertical: 10,
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ color: generatingProcurementTasks ? DairyColors.textSecondary : "#FFFFFF", fontWeight: "800" }}>
                          {generatingProcurementTasks
                            ? x("Generating...", "बना रहे हैं...")
                            : x("Generate Procurement Tasks", "खरीद टास्क बनाएं")}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <Text style={{ marginTop: 12, color: DairyColors.textSecondary, fontWeight: "700" }}>
                    {x("Raw Material Stock", "कच्चे माल का स्टॉक")}
                  </Text>
                  {materials.length === 0 ? (
                    <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                      {loadingManagement
                        ? x("Loading...", "लोड हो रहा है...")
                        : x("No raw materials yet.", "अभी कोई कच्चा माल नहीं है।")}
                    </Text>
                  ) : (
                    materials.slice(0, 12).map((m) => {
                      const forecastRow = forecastByMaterialId.get(m.feedMaterialId);
                      const riskColor =
                        forecastRow?.riskLevel === "HIGH"
                          ? DairyColors.danger
                          : forecastRow?.riskLevel === "MEDIUM"
                            ? DairyColors.warning
                            : DairyColors.success;
                      return (
                        <Pressable
                          key={m.feedMaterialId}
                          onPress={() => startEditMaterial(m)}
                          disabled={!canManageFeedManagement}
                          style={{
                            marginTop: 8,
                            borderWidth: 1,
                            borderColor: m.lowStock ? DairyColors.warning : DairyColors.border,
                            backgroundColor: m.lowStock ? DairyColors.warningSoft : DairyColors.surfaceMuted,
                            borderRadius: 10,
                            padding: 8,
                          }}
                        >
                          <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>{m.materialName}</Text>
                          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                            {materialCategoryLabel(m.category)} | {m.availableQty.toFixed(2)} {unitLabel(m.unit)} |{" "}
                            {x("Reorder", "रीऑर्डर")} {m.reorderLevelQty.toFixed(2)}
                          </Text>
                          {forecastRow ? (
                            <>
                              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                                {x(
                                  `Daily use ${forecastRow.estimatedDailyConsumptionQty.toFixed(2)} | Days left ${
                                    forecastRow.daysOfStockLeft == null ? "-" : forecastRow.daysOfStockLeft.toFixed(1)
                                  }`,
                                  `दैनिक खपत ${forecastRow.estimatedDailyConsumptionQty.toFixed(2)} | बचे दिन ${
                                    forecastRow.daysOfStockLeft == null ? "-" : forecastRow.daysOfStockLeft.toFixed(1)
                                  }`
                                )}
                              </Text>
                              <Text style={{ marginTop: 2, color: riskColor, fontWeight: "700" }}>
                                {x(
                                  `Risk ${forecastRow.riskLevel} | Reorder 30d ${forecastRow.recommendedReorderQty30Days.toFixed(
                                    2
                                  )} | 90d ${forecastRow.recommendedReorderQty90Days.toFixed(2)}`,
                                  `जोखिम ${forecastRow.riskLevel} | रीऑर्डर 30-दिन ${forecastRow.recommendedReorderQty30Days.toFixed(
                                    2
                                  )} | 90-दिन ${forecastRow.recommendedReorderQty90Days.toFixed(2)}`
                                )}
                              </Text>
                            </>
                          ) : null}
                          {canManageFeedManagement ? (
                            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                              {x("Tap to edit", "एडिट के लिए टैप करें")}
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    })
                  )}

                  {canManageFeedManagement ? (
                    <>
                      <Text style={{ marginTop: 12, color: DairyColors.textSecondary, fontWeight: "700" }}>
                        {editingMaterialId ? x("Edit Raw Material", "कच्चा माल एडिट करें") : x("Add Raw Material", "कच्चा माल जोड़ें")}
                      </Text>
                      <TextInput
                        value={materialName}
                        onChangeText={setMaterialName}
                        placeholder={x("Material Name", "कच्चे माल का नाम")}
                        placeholderTextColor="#99A99A"
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
    
                      <Text style={{ marginTop: 8, color: DairyColors.textSecondary, fontWeight: "700" }}>
                        {x("Category", "श्रेणी")}
                      </Text>
                      <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {MATERIAL_CATEGORIES.map((category) => (
                          <Pressable
                            key={category}
                            onPress={() => setMaterialCategory(category)}
                            style={{
                              borderWidth: 1,
                              borderColor: materialCategory === category ? DairyColors.primary : DairyColors.border,
                              backgroundColor: materialCategory === category ? DairyColors.primarySoft : DairyColors.surface,
                              borderRadius: 999,
                              paddingHorizontal: 10,
                              paddingVertical: 7,
                            }}
                          >
                            <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                              {materialCategoryLabel(category)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
    
                      <Text style={{ marginTop: 8, color: DairyColors.textSecondary, fontWeight: "700" }}>
                        {x("Unit", "यूनिट")}
                      </Text>
                      <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {MATERIAL_UNITS.map((unit) => (
                          <Pressable
                            key={unit}
                            onPress={() => setMaterialUnit(unit)}
                            style={{
                              borderWidth: 1,
                              borderColor: materialUnit === unit ? DairyColors.primary : DairyColors.border,
                              backgroundColor: materialUnit === unit ? DairyColors.primarySoft : DairyColors.surface,
                              borderRadius: 999,
                              paddingHorizontal: 10,
                              paddingVertical: 7,
                            }}
                          >
                            <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{unitLabel(unit)}</Text>
                          </Pressable>
                        ))}
                      </View>

                      <TextInput
                        value={materialQty}
                        onChangeText={setMaterialQty}
                        keyboardType="decimal-pad"
                        placeholder={x("Available Qty", "उपलब्ध मात्रा")}
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
                        value={materialReorderQty}
                        onChangeText={setMaterialReorderQty}
                        keyboardType="decimal-pad"
                        placeholder={x("Reorder Level Qty", "रीऑर्डर स्तर मात्रा")}
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
                        value={materialCost}
                        onChangeText={setMaterialCost}
                        keyboardType="decimal-pad"
                        placeholder={x("Cost per Unit (optional)", "प्रति यूनिट लागत (वैकल्पिक)")}
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
                        value={materialSupplier}
                        onChangeText={setMaterialSupplier}
                        placeholder={x("Supplier (optional)", "सप्लायर (वैकल्पिक)")}
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
                        value={materialNotes}
                        onChangeText={setMaterialNotes}
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
                        disabled={savingManagement}
                        onPress={saveMaterial}
                        style={{
                          marginTop: 8,
                          borderRadius: 10,
                          padding: 12,
                          alignItems: "center",
                          backgroundColor: savingManagement ? DairyColors.textSecondary : DairyColors.primary,
                        }}
                      >
                        <Text style={{ color: "white", fontWeight: "800" }}>
                          {savingManagement
                            ? x("Saving...", "सेव हो रहा है...")
                            : editingMaterialId
                              ? x("Update Raw Material", "कच्चा माल अपडेट करें")
                              : x("Add Raw Material", "कच्चा माल जोड़ें")}
                        </Text>
                      </Pressable>
                      {editingMaterialId ? (
                        <Pressable
                          onPress={resetMaterialForm}
                          style={{
                            marginTop: 8,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: DairyColors.border,
                            padding: 10,
                            alignItems: "center",
                          }}
                        >
                          <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
                            {x("Cancel Material Edit", "मटेरियल एडिट रद्द करें")}
                          </Text>
                        </Pressable>
                      ) : null}

                      <Text style={{ marginTop: 12, color: DairyColors.textSecondary, fontWeight: "700" }}>
                        {x("Adjust Stock", "स्टॉक बदलें")}
                      </Text>
                      <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {materials.slice(0, 10).map((m) => (
                          <Pressable
                            key={m.feedMaterialId}
                            onPress={() => setStockAdjustMaterialId(m.feedMaterialId)}
                            style={{
                              borderWidth: 1,
                              borderColor:
                                stockAdjustMaterialId === m.feedMaterialId ? DairyColors.primary : DairyColors.border,
                              backgroundColor:
                                stockAdjustMaterialId === m.feedMaterialId ? DairyColors.primarySoft : DairyColors.surface,
                              borderRadius: 999,
                              paddingHorizontal: 10,
                              paddingVertical: 7,
                            }}
                          >
                            <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{m.materialName}</Text>
                          </Pressable>
                        ))}
                      </View>
                      <TextInput
                        value={stockAdjustQty}
                        onChangeText={setStockAdjustQty}
                        keyboardType="decimal-pad"
                        placeholder={x("Quantity delta (+/-)", "मात्रा बदलाव (+/-)")}
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
                        value={stockAdjustReason}
                        onChangeText={setStockAdjustReason}
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
                        disabled={savingManagement}
                        onPress={adjustStock}
                        style={{
                          marginTop: 8,
                          borderRadius: 10,
                          padding: 12,
                          alignItems: "center",
                          backgroundColor: savingManagement ? DairyColors.textSecondary : DairyColors.primary,
                        }}
                      >
                        <Text style={{ color: "white", fontWeight: "800" }}>
                          {savingManagement ? x("Saving...", "सेव हो रहा है...") : x("Update Stock", "स्टॉक अपडेट करें")}
                        </Text>
                      </Pressable>
                    </>
                  ) : null}
                </>
              ) : null}

              {!isWorkerChecklistOnly ? (
                <>
                  <Text style={{ marginTop: 14, color: DairyColors.textSecondary, fontWeight: "700" }}>
                    {x("Daily Recipes", "दैनिक रेसिपी")}
                  </Text>
                  {recipes.length === 0 ? (
                    <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                      {x("No recipes yet.", "अभी कोई रेसिपी नहीं है।")}
                    </Text>
                  ) : (
                    recipes.slice(0, 8).map((recipe) => (
                      <Pressable
                        key={recipe.feedRecipeId}
                        onPress={() => startEditRecipe(recipe)}
                        disabled={!canManageFeedManagement}
                        style={{
                          marginTop: 8,
                          borderWidth: 1,
                          borderColor: DairyColors.border,
                          borderRadius: 10,
                          padding: 8,
                          backgroundColor: DairyColors.surfaceMuted,
                        }}
                      >
                        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                          {recipe.recipeName} ({rationPhaseLabel(recipe.rationPhase)})
                        </Text>
                        <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                          {x("Target", "लक्ष्य")}: {recipe.targetAnimalCount ?? "-"} | {x("Ingredients", "सामग्री")}: {recipe.ingredients}
                        </Text>
                        {recipe.instructions ? (
                          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                            {x("SOP", "SOP")}: {recipe.instructions}
                          </Text>
                        ) : null}
                        {canManageFeedManagement ? (
                          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                            {x("Tap to edit", "एडिट के लिए टैप करें")}
                          </Text>
                        ) : null}
                      </Pressable>
                    ))
                  )}

                  {canManageFeedManagement ? (
                    <>
                      <Text style={{ marginTop: 12, color: DairyColors.textSecondary, fontWeight: "700" }}>
                        {editingRecipeId ? x("Edit Recipe", "रेसिपी एडिट करें") : x("Add Recipe", "रेसिपी जोड़ें")}
                      </Text>
                  <TextInput
                    value={recipeName}
                    onChangeText={setRecipeName}
                    placeholder={x("Recipe Name", "रेसिपी नाम")}
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
                  <Text style={{ marginTop: 8, color: DairyColors.textSecondary, fontWeight: "700" }}>
                    {x("Ration Phase", "राशन चरण")}
                  </Text>
                  <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {RATION_PHASES.map((phase) => (
                      <Pressable
                        key={phase}
                        onPress={() => setRecipePhase(phase)}
                        style={{
                          borderWidth: 1,
                          borderColor: recipePhase === phase ? DairyColors.primary : DairyColors.border,
                          backgroundColor: recipePhase === phase ? DairyColors.primarySoft : DairyColors.surface,
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 7,
                        }}
                      >
                        <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{rationPhaseLabel(phase)}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    value={recipeTargetCount}
                    onChangeText={setRecipeTargetCount}
                    keyboardType="number-pad"
                    placeholder={x("Target Animals (optional)", "लक्ष्य जानवर (वैकल्पिक)")}
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
                    value={recipeIngredients}
                    onChangeText={setRecipeIngredients}
                    placeholder={x("Ingredients (comma-separated)", "सामग्री (कॉमा से अलग)")}
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
                    value={recipeInstructions}
                    onChangeText={setRecipeInstructions}
                    placeholder={x("SOP/Instructions (optional)", "SOP/निर्देश (वैकल्पिक)")}
                    placeholderTextColor="#99A99A"
                    multiline
                    style={{
                      marginTop: 8,
                      minHeight: 64,
                      borderWidth: 1,
                      borderColor: DairyColors.border,
                      borderRadius: 10,
                      padding: 10,
                      color: DairyColors.textPrimary,
                      backgroundColor: DairyColors.surfaceMuted,
                      textAlignVertical: "top",
                    }}
                  />
                  <Pressable
                    disabled={savingManagement}
                    onPress={saveRecipe}
                    style={{
                      marginTop: 8,
                      borderRadius: 10,
                      padding: 12,
                      alignItems: "center",
                      backgroundColor: savingManagement ? DairyColors.textSecondary : DairyColors.primary,
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "800" }}>
                      {savingManagement
                        ? x("Saving...", "सेव हो रहा है...")
                        : editingRecipeId
                          ? x("Update Recipe", "रेसिपी अपडेट करें")
                          : x("Save Recipe", "रेसिपी सेव करें")}
                    </Text>
                  </Pressable>
                      {editingRecipeId ? (
                        <Pressable
                          onPress={resetRecipeForm}
                          style={{
                            marginTop: 8,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: DairyColors.border,
                            padding: 10,
                            alignItems: "center",
                          }}
                        >
                          <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
                            {x("Cancel Recipe Edit", "रेसिपी एडिट रद्द करें")}
                          </Text>
                        </Pressable>
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : null}

              <Text style={{ marginTop: 14, color: DairyColors.textSecondary, fontWeight: "700" }}>
                {isWorkerChecklistOnly ? x("Today Feed Checklist", "आज की फीड चेकलिस्ट") : x("Feed SOP Tasks", "फीड SOP टास्क")}
              </Text>

              {isWorkerChecklistOnly ? (
                workerChecklistTasks.length === 0 ? (
                  <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                    {x("No worker tasks for selected date.", "चुनी तारीख पर वर्कर टास्क नहीं हैं।")}
                  </Text>
                ) : (
                  workerChecklistTasks.map((task) => {
                    const done = task.status === "DONE";
                    const canAct = canActOnFeedTask(task);
                    return (
                      <Pressable
                        key={task.feedTaskId}
                        disabled={!canAct}
                        onPress={() => updateTaskStatus(task.feedTaskId, done ? "PENDING" : "DONE")}
                        style={{
                          marginTop: 8,
                          borderWidth: 1,
                          borderColor: done ? DairyColors.success : DairyColors.border,
                          borderRadius: 10,
                          padding: 10,
                          backgroundColor: done ? DairyColors.successSoft : DairyColors.surfaceMuted,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                          opacity: canAct ? 1 : 0.55,
                        }}
                      >
                        <Ionicons
                          name={done ? "checkbox" : "square-outline"}
                          size={20}
                          color={done ? DairyColors.success : DairyColors.textSecondary}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>{task.title}</Text>
                          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                            {task.dueTime ? `${x("Time", "समय")}: ${task.dueTime}` : x("No time set", "समय सेट नहीं")}
                          </Text>
                          {task.details ? (
                            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>{task.details}</Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })
                )
              ) : (
                <>
                  {(isManagerSupervisorFeed || isAdminFeed) && (
                    <>
                      <Text style={{ marginTop: 6, color: DairyColors.textSecondary, fontWeight: "700" }}>
                        {x("Preparation Plan (What + With What + Time)", "तैयारी योजना (क्या + किससे + समय)")}
                      </Text>
                      {preparationTasks.length === 0 ? (
                        <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                          {x("No open preparation tasks.", "कोई ओपन तैयारी टास्क नहीं है।")}
                        </Text>
                      ) : (
                        preparationTasks.map((task) => (
                          <View
                            key={`plan-${task.feedTaskId}`}
                            style={{
                              marginTop: 8,
                              borderWidth: 1,
                              borderColor: DairyColors.border,
                              borderRadius: 10,
                              padding: 8,
                              backgroundColor: DairyColors.surfaceMuted,
                            }}
                          >
                            <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>{task.title}</Text>
                            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                              {x("Time", "समय")}: {task.dueTime ?? x("Not set", "सेट नहीं")} | {x("Assigned", "सौंपा गया")}:
                              {" "}{roleLabel(task.assignedRole)} | {x("Status", "स्थिति")}: {taskStatusLabel(task.status)}
                            </Text>
                            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                              {x("User", "यूज़र")}: {task.assignedToUsername ?? x("Unassigned", "अनअसाइन्ड")}
                            </Text>
                            {task.details ? (
                              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>{task.details}</Text>
                            ) : null}
                          </View>
                        ))
                      )}
                    </>
                  )}

                  {!isWorkerChecklistOnly && canManageFeedManagement ? (
                    <View
                      style={{
                        marginTop: 8,
                        borderWidth: 1,
                        borderColor: DairyColors.border,
                        borderRadius: 10,
                        padding: 8,
                        backgroundColor: DairyColors.surfaceMuted,
                      }}
                    >
                      <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                        {x("Task Manager Filters", "टास्क मैनेजर फ़िल्टर")}
                      </Text>
                      <Text style={{ marginTop: 6, color: DairyColors.textSecondary, fontWeight: "700" }}>
                        {x("Role", "भूमिका")}
                      </Text>
                      <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        <Pressable
                          onPress={() => setTaskFilterRole("ALL")}
                          style={{
                            borderWidth: 1,
                            borderColor: taskFilterRole === "ALL" ? DairyColors.primary : DairyColors.border,
                            backgroundColor: taskFilterRole === "ALL" ? DairyColors.primarySoft : DairyColors.surface,
                            borderRadius: 999,
                            paddingHorizontal: 10,
                            paddingVertical: 7,
                          }}
                        >
                          <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{x("All", "सभी")}</Text>
                        </Pressable>
                        {TASK_ASSIGNEES.map((role) => (
                          <Pressable
                            key={`filter-role-${role}`}
                            onPress={() => setTaskFilterRole(role)}
                            style={{
                              borderWidth: 1,
                              borderColor: taskFilterRole === role ? DairyColors.primary : DairyColors.border,
                              backgroundColor: taskFilterRole === role ? DairyColors.primarySoft : DairyColors.surface,
                              borderRadius: 999,
                              paddingHorizontal: 10,
                              paddingVertical: 7,
                            }}
                          >
                            <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{roleLabel(role)}</Text>
                          </Pressable>
                        ))}
                      </View>

                      <Text style={{ marginTop: 8, color: DairyColors.textSecondary, fontWeight: "700" }}>
                        {x("User", "यूज़र")}
                      </Text>
                      <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        <Pressable
                          onPress={() => setTaskFilterAssignee(TASK_FILTER_ALL)}
                          style={{
                            borderWidth: 1,
                            borderColor: taskFilterAssignee === TASK_FILTER_ALL ? DairyColors.primary : DairyColors.border,
                            backgroundColor: taskFilterAssignee === TASK_FILTER_ALL ? DairyColors.primarySoft : DairyColors.surface,
                            borderRadius: 999,
                            paddingHorizontal: 10,
                            paddingVertical: 7,
                          }}
                        >
                          <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{x("All", "सभी")}</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setTaskFilterAssignee(TASK_FILTER_MINE)}
                          style={{
                            borderWidth: 1,
                            borderColor: taskFilterAssignee === TASK_FILTER_MINE ? DairyColors.primary : DairyColors.border,
                            backgroundColor: taskFilterAssignee === TASK_FILTER_MINE ? DairyColors.primarySoft : DairyColors.surface,
                            borderRadius: 999,
                            paddingHorizontal: 10,
                            paddingVertical: 7,
                          }}
                        >
                          <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{x("Mine", "मेरे")}</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setTaskFilterAssignee(TASK_FILTER_UNASSIGNED)}
                          style={{
                            borderWidth: 1,
                            borderColor: taskFilterAssignee === TASK_FILTER_UNASSIGNED ? DairyColors.primary : DairyColors.border,
                            backgroundColor: taskFilterAssignee === TASK_FILTER_UNASSIGNED ? DairyColors.primarySoft : DairyColors.surface,
                            borderRadius: 999,
                            paddingHorizontal: 10,
                            paddingVertical: 7,
                          }}
                        >
                          <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                            {x("Unassigned", "अनअसाइन्ड")}
                          </Text>
                        </Pressable>
                        {taskFilterUsers.map((row) => (
                          <Pressable
                            key={`filter-user-${row.username}`}
                            onPress={() => setTaskFilterAssignee(row.username)}
                            style={{
                              borderWidth: 1,
                              borderColor: taskFilterAssignee === row.username ? DairyColors.primary : DairyColors.border,
                              backgroundColor: taskFilterAssignee === row.username ? DairyColors.primarySoft : DairyColors.surface,
                              borderRadius: 999,
                              paddingHorizontal: 10,
                              paddingVertical: 7,
                            }}
                          >
                            <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{row.username}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ) : null}

                  {visibleTasks.length === 0 ? (
                    <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                      {x("No SOP tasks for selected date.", "चुनी तारीख पर कोई SOP टास्क नहीं है।")}
                    </Text>
                  ) : (
                    visibleTasks.map((task) => (
                      (() => {
                        const canAct = canActOnFeedTask(task);
                        return (
                          <View
                            key={task.feedTaskId}
                            style={{
                              marginTop: 8,
                              borderWidth: 1,
                              borderColor: DairyColors.border,
                              borderRadius: 10,
                              padding: 8,
                              backgroundColor: DairyColors.surfaceMuted,
                            }}
                          >
                            <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>{task.title}</Text>
                            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                              {task.taskDate} | {x("Time", "समय")}: {task.dueTime ?? x("Not set", "सेट नहीं")} | {roleLabel(task.assignedRole)} | {taskPriorityLabel(task.priority)}
                            </Text>
                            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                              {x("Assigned user", "सौंपा गया यूज़र")}: {task.assignedToUsername ?? x("Unassigned", "अनअसाइन्ड")}
                              {task.assignedByUsername ? ` | ${x("by", "द्वारा")}: ${task.assignedByUsername}` : ""}
                            </Text>
                            {task.details ? (
                              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>{task.details}</Text>
                            ) : null}
                            <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                              {TASK_STATUSES.map((status) => (
                                <Pressable
                                  key={status}
                                  disabled={!canAct}
                                  onPress={() => updateTaskStatus(task.feedTaskId, status)}
                                  style={{
                                    borderWidth: 1,
                                    borderColor: task.status === status ? DairyColors.primary : DairyColors.border,
                                    backgroundColor: task.status === status ? DairyColors.primarySoft : DairyColors.surface,
                                    borderRadius: 999,
                                    paddingHorizontal: 10,
                                    paddingVertical: 6,
                                    opacity: canAct ? 1 : 0.55,
                                  }}
                                >
                                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{taskStatusLabel(status)}</Text>
                                </Pressable>
                              ))}
                            </View>
                            {!canAct ? (
                              <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                                {x("Read only: assigned user can update this task.", "केवल असाइन्ड यूज़र यह टास्क अपडेट कर सकता है।")}
                              </Text>
                            ) : null}
                          </View>
                        );
                      })()
                    ))
                  )}

                  {canManageFeedManagement ? (
                    <>
                      <Text style={{ marginTop: 12, color: DairyColors.textSecondary, fontWeight: "700" }}>
                        {x("Create SOP Task", "SOP टास्क बनाएं")}
                      </Text>
                      <DateInput
                        value={taskDate}
                        onChangeText={setTaskDate}
                        placeholder={x("Task date (YYYY-MM-DD)", "टास्क तारीख (YYYY-MM-DD)")}
                      />
                      <TextInput
                        value={taskTitle}
                        onChangeText={setTaskTitle}
                        placeholder={x("Task title", "टास्क नाम")}
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
                        value={taskDetails}
                        onChangeText={setTaskDetails}
                        placeholder={x("Task details (optional)", "टास्क विवरण (वैकल्पिक)")}
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

                      <Text style={{ marginTop: 8, color: DairyColors.textSecondary, fontWeight: "700" }}>
                        {x("Priority", "प्राथमिकता")}
                      </Text>
                      <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {TASK_PRIORITIES.map((priority) => (
                          <Pressable
                            key={priority}
                            onPress={() => setTaskPriority(priority)}
                            style={{
                              borderWidth: 1,
                              borderColor: taskPriority === priority ? DairyColors.primary : DairyColors.border,
                              backgroundColor: taskPriority === priority ? DairyColors.primarySoft : DairyColors.surface,
                              borderRadius: 999,
                              paddingHorizontal: 10,
                              paddingVertical: 7,
                            }}
                          >
                            <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                              {taskPriorityLabel(priority)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      <Text style={{ marginTop: 8, color: DairyColors.textSecondary, fontWeight: "700" }}>
                        {x("Assign To", "सौंपें")}
                      </Text>
                      <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {TASK_ASSIGNEES.map((role) => (
                          <Pressable
                            key={role}
                            onPress={() => setTaskAssignedRole(role)}
                            style={{
                              borderWidth: 1,
                              borderColor: taskAssignedRole === role ? DairyColors.primary : DairyColors.border,
                              backgroundColor: taskAssignedRole === role ? DairyColors.primarySoft : DairyColors.surface,
                              borderRadius: 999,
                              paddingHorizontal: 10,
                              paddingVertical: 7,
                            }}
                          >
                            <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{roleLabel(role)}</Text>
                          </Pressable>
                        ))}
                      </View>

                      <Text style={{ marginTop: 8, color: DairyColors.textSecondary, fontWeight: "700" }}>
                        {x("Specific User (optional)", "खास यूज़र (वैकल्पिक)")}
                      </Text>
                      <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        <Pressable
                          onPress={() => setTaskAssignedToUsername("")}
                          style={{
                            borderWidth: 1,
                            borderColor: taskAssignedToUsername === "" ? DairyColors.primary : DairyColors.border,
                            backgroundColor: taskAssignedToUsername === "" ? DairyColors.primarySoft : DairyColors.surface,
                            borderRadius: 999,
                            paddingHorizontal: 10,
                            paddingVertical: 7,
                          }}
                        >
                          <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                            {x("Unassigned", "अनअसाइन्ड")}
                          </Text>
                        </Pressable>
                        {usersForSelectedTaskRole.map((row) => (
                          <Pressable
                            key={`assignee-${row.username}`}
                            onPress={() => setTaskAssignedToUsername(row.username)}
                            style={{
                              borderWidth: 1,
                              borderColor: taskAssignedToUsername === row.username ? DairyColors.primary : DairyColors.border,
                              backgroundColor: taskAssignedToUsername === row.username ? DairyColors.primarySoft : DairyColors.surface,
                              borderRadius: 999,
                              paddingHorizontal: 10,
                              paddingVertical: 7,
                            }}
                          >
                            <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                              {row.username}
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      <TextInput
                        value={taskDueTime}
                        onChangeText={setTaskDueTime}
                        placeholder={x("Due time HH:MM (optional)", "समय HH:MM (वैकल्पिक)")}
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
                        disabled={savingManagement}
                        onPress={saveTask}
                        style={{
                          marginTop: 8,
                          borderRadius: 10,
                          padding: 12,
                          alignItems: "center",
                          backgroundColor: savingManagement ? DairyColors.textSecondary : DairyColors.primary,
                        }}
                      >
                        <Text style={{ color: "white", fontWeight: "800" }}>
                          {savingManagement ? x("Saving...", "सेव हो रहा है...") : x("Add SOP Task", "SOP टास्क जोड़ें")}
                        </Text>
                      </Pressable>
                    </>
                  ) : null}
                </>
              )}
            </View>
          </View>
        }
      />
    </View>
  );
}
