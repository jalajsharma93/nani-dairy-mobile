import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Switch, Text, TextInput, View } from "react-native";
import {
  CreateCustomerSubscriptionLinePayload,
  CustomerApi,
  CustomerRecordResponse,
  CustomerSubscriptionLineResponse,
  CustomerType,
  ProductType,
  Shift,
  SubscriptionFrequency,
  UpdateCustomerSubscriptionLinePayload,
} from "@/src/services/api";
import { DairyColors } from "@/src/constants/dairy-theme";
import { useAuth } from "@/src/state/auth";
import { useI18n } from "@/src/state/i18n";
import { resolveRolePermissions } from "@/src/state/permissions";
import { todayLocalISO } from "@/src/utils/date";
import { DateInput } from "../../../components/date-input";

const CUSTOMER_TYPES: CustomerType[] = ["COOPERATIVE", "RETAIL", "INDIVIDUAL"];
const SUBSCRIPTION_FREQUENCIES: SubscriptionFrequency[] = ["DAILY", "WEEKLY"];
const SHIFT_OPTIONS: Shift[] = ["AM", "PM"];
const PRODUCT_OPTIONS: ProductType[] = ["MILK", "CURD", "BUTTERMILK", "PANEER", "GHEE"];
const DAY_OPTIONS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const DAY_ALIAS_TO_SHORT: Record<string, (typeof DAY_OPTIONS)[number]> = {
  MON: "MON",
  MONDAY: "MON",
  TUE: "TUE",
  TUESDAY: "TUE",
  WED: "WED",
  WEDNESDAY: "WED",
  THU: "THU",
  THURSDAY: "THU",
  FRI: "FRI",
  FRIDAY: "FRI",
  SAT: "SAT",
  SATURDAY: "SAT",
  SUN: "SUN",
  SUNDAY: "SUN",
};

function normalizeDaysCsv(input: string | null | undefined) {
  if (!input) return [] as string[];
  return Array.from(
    new Set(
      input
        .split(/[,\s]+/)
        .map((item) => DAY_ALIAS_TO_SHORT[item.trim().toUpperCase()])
        .filter((item): item is (typeof DAY_OPTIONS)[number] => Boolean(item))
    )
  );
}

function normalizeSkipDatesCsv(input: string | null | undefined) {
  if (!input) {
    return [] as string[];
  }
  const values = Array.from(
    new Set(
      input
        .split(/[,\s]+/)
        .map((value) => value.trim())
        .filter((value) => ISO_DATE_REGEX.test(value))
    )
  );
  return values.sort((a, b) => a.localeCompare(b));
}

export default function CustomersScreen() {
  const { user } = useAuth();
  const { x, label } = useI18n();
  const permissions = resolveRolePermissions(user?.role);
  const canManageCustomers = permissions.canManageCustomers;

  const [rows, setRows] = useState<CustomerRecordResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerType, setCustomerType] = useState<CustomerType>("RETAIL");
  const [phone, setPhone] = useState("");
  const [routeName, setRouteName] = useState("");
  const [collectionPoint, setCollectionPoint] = useState("");
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [dailySubscriptionQty, setDailySubscriptionQty] = useState("");
  const [subscriptionFrequency, setSubscriptionFrequency] = useState<SubscriptionFrequency>("DAILY");
  const [defaultMilkUnitPrice, setDefaultMilkUnitPrice] = useState("");
  const [subscriptionPausedUntil, setSubscriptionPausedUntil] = useState("");
  const [subscriptionSkipDatesCsv, setSubscriptionSkipDatesCsv] = useState("");
  const [subscriptionHolidayWeekdaysCsv, setSubscriptionHolidayWeekdaysCsv] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState("");
  const [payoutAmountByCustomer, setPayoutAmountByCustomer] = useState<Record<string, string>>({});
  const [plannerCustomerId, setPlannerCustomerId] = useState<string | null>(null);
  const [plannerRows, setPlannerRows] = useState<CustomerSubscriptionLineResponse[]>([]);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [plannerSaving, setPlannerSaving] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [lineShift, setLineShift] = useState<Shift>("AM");
  const [lineProduct, setLineProduct] = useState<ProductType>("MILK");
  const [lineQty, setLineQty] = useState("");
  const [lineUnitPrice, setLineUnitPrice] = useState("");
  const [linePreferredTime, setLinePreferredTime] = useState("");
  const [lineStartDate, setLineStartDate] = useState("");
  const [lineEndDate, setLineEndDate] = useState("");
  const [lineDays, setLineDays] = useState<string[]>(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
  const [lineActive, setLineActive] = useState(true);
  const [lineNotes, setLineNotes] = useState("");

  const loadCustomers = useCallback(async () => {
    try {
      setLoading(true);
      setRows(await CustomerApi.list());
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load customers.", "ग्राहक रिकॉर्ड लोड नहीं हुआ।")
      );
    } finally {
      setLoading(false);
    }
  }, [x]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    if (rows.length === 0) {
      setPlannerCustomerId(null);
      setPlannerRows([]);
      return;
    }
    if (!plannerCustomerId || !rows.some((row) => row.customerId === plannerCustomerId)) {
      setPlannerCustomerId(rows[0].customerId);
    }
  }, [plannerCustomerId, rows]);

  const loadSubscriptionLines = useCallback(async () => {
    if (!plannerCustomerId) {
      setPlannerRows([]);
      return;
    }
    try {
      setPlannerLoading(true);
      const data = await CustomerApi.listSubscriptionLines(plannerCustomerId);
      setPlannerRows(data);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load subscription plan.", "सब्सक्रिप्शन प्लान लोड नहीं हुआ।")
      );
    } finally {
      setPlannerLoading(false);
    }
  }, [plannerCustomerId, x]);

  useEffect(() => {
    void loadSubscriptionLines();
  }, [loadSubscriptionLines]);

  const resetSubscriptionLineForm = () => {
    setEditingLineId(null);
    setLineShift("AM");
    setLineProduct("MILK");
    setLineQty("");
    setLineUnitPrice("");
    setLinePreferredTime("");
    setLineStartDate("");
    setLineEndDate("");
    setLineDays(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
    setLineActive(true);
    setLineNotes("");
  };

  const startEditSubscriptionLine = (row: CustomerSubscriptionLineResponse) => {
    if (!canManageCustomers) {
      Alert.alert(
        x("Role restricted", "रोल अनुमति नहीं"),
        x("Only ADMIN or MANAGER can edit subscription lines.", "सब्सक्रिप्शन लाइन बदलना सिर्फ ADMIN या MANAGER कर सकता है।")
      );
      return;
    }
    setEditingLineId(row.subscriptionLineId);
    setLineShift(row.taskShift);
    setLineProduct(row.productType);
    setLineQty(String(row.quantity));
    setLineUnitPrice(String(row.unitPrice));
    setLinePreferredTime(row.preferredTime ?? "");
    setLineStartDate(row.startDate ?? "");
    setLineEndDate(row.endDate ?? "");
    const parsedDays = normalizeDaysCsv(row.activeDaysCsv);
    setLineDays(parsedDays.length > 0 ? parsedDays : ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
    setLineActive(row.active);
    setLineNotes(row.notes ?? "");
  };

  const toggleLineDay = (day: string) => {
    setLineDays((prev) => (prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day]));
  };

  const saveSubscriptionLine = async () => {
    if (!plannerCustomerId) {
      return;
    }
    if (!canManageCustomers) {
      return;
    }
    const qty = Number(lineQty);
    const unitPrice = Number(lineUnitPrice);
    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert(x("Invalid value", "गलत मान"), x("Quantity must be positive.", "मात्रा पॉजिटिव होनी चाहिए।"));
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      Alert.alert(x("Invalid value", "गलत मान"), x("Unit price must be positive.", "यूनिट कीमत पॉजिटिव होनी चाहिए।"));
      return;
    }
    const preferredTime = linePreferredTime.trim();
    if (preferredTime && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(preferredTime)) {
      Alert.alert(x("Invalid time", "गलत समय"), x("Use time format HH:mm.", "समय का फॉर्मेट HH:mm रखें।"));
      return;
    }
    if (lineDays.length === 0) {
      Alert.alert(x("Missing details", "जानकारी अधूरी"), x("Select at least one day.", "कम से कम एक दिन चुनें।"));
      return;
    }
    const startDate = lineStartDate.trim();
    const endDate = lineEndDate.trim();
    if (startDate && !ISO_DATE_REGEX.test(startDate)) {
      Alert.alert(x("Invalid date", "गलत तारीख"), x("Start date must be YYYY-MM-DD.", "शुरुआत तारीख YYYY-MM-DD होनी चाहिए।"));
      return;
    }
    if (endDate && !ISO_DATE_REGEX.test(endDate)) {
      Alert.alert(x("Invalid date", "गलत तारीख"), x("End date must be YYYY-MM-DD.", "समाप्ति तारीख YYYY-MM-DD होनी चाहिए।"));
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      Alert.alert(
        x("Invalid date range", "गलत तारीख रेंज"),
        x("End date cannot be before start date.", "समाप्ति तारीख शुरुआत से पहले नहीं हो सकती।")
      );
      return;
    }

    const payloadBase = {
      taskShift: lineShift,
      productType: lineProduct,
      quantity: qty,
      unitPrice,
      preferredTime: preferredTime || null,
      activeDaysCsv: lineDays.join(","),
      startDate: startDate || null,
      endDate: endDate || null,
      notes: lineNotes.trim() || null,
    };

    try {
      setPlannerSaving(true);
      let lifecycleUpdated = false;
      if (plannerCustomer) {
        const shouldActivateSubscription = !plannerCustomer.subscriptionActive;
        const shouldSetDailyQty = (plannerCustomer.dailySubscriptionQty ?? 0) <= 0;
        const shouldSetDefaultPrice = (plannerCustomer.defaultMilkUnitPrice ?? 0) <= 0;
        if (shouldActivateSubscription || shouldSetDailyQty || shouldSetDefaultPrice) {
          const customerPayload = buildCustomerUpdatePayload(plannerCustomer, {
            subscriptionActive: true,
          });
          customerPayload.subscriptionActive = true;
          if ((customerPayload.dailySubscriptionQty ?? 0) <= 0) {
            customerPayload.dailySubscriptionQty = qty;
          }
          if (!customerPayload.subscriptionFrequency) {
            customerPayload.subscriptionFrequency = "DAILY";
          }
          if ((customerPayload.defaultMilkUnitPrice ?? 0) <= 0) {
            customerPayload.defaultMilkUnitPrice = unitPrice;
          }
          await CustomerApi.update(plannerCustomer.customerId, customerPayload);
          lifecycleUpdated = true;
        }
      }

      if (editingLineId) {
        const payload: UpdateCustomerSubscriptionLinePayload = {
          ...payloadBase,
          active: lineActive,
        };
        await CustomerApi.updateSubscriptionLine(plannerCustomerId, editingLineId, payload);
      } else {
        const payload: CreateCustomerSubscriptionLinePayload = {
          ...payloadBase,
          active: lineActive,
        };
        await CustomerApi.createSubscriptionLine(plannerCustomerId, payload);
      }
      if (lifecycleUpdated) {
        await loadCustomers();
      }
      await loadSubscriptionLines();
      resetSubscriptionLineForm();
      Alert.alert(
        x("Saved", "सेव हो गया"),
        lifecycleUpdated
          ? x(
              "Subscription line saved. Customer subscription was auto-activated and defaults were filled.",
              "सब्सक्रिप्शन लाइन सेव हुई। ग्राहक सब्सक्रिप्शन ऑटो-एक्टिव हुआ और डिफ़ॉल्ट मान भर दिए गए।"
            )
          : editingLineId
            ? x("Subscription line updated.", "सब्सक्रिप्शन लाइन अपडेट हो गई।")
            : x("Subscription line added.", "सब्सक्रिप्शन लाइन जोड़ दी गई।")
      );
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not save subscription line.", "सब्सक्रिप्शन लाइन सेव नहीं हो पाई।")
      );
    } finally {
      setPlannerSaving(false);
    }
  };

  const deleteSubscriptionLine = async (subscriptionLineId: string) => {
    if (!plannerCustomerId || !canManageCustomers) {
      return;
    }
    try {
      setPlannerSaving(true);
      await CustomerApi.deleteSubscriptionLine(plannerCustomerId, subscriptionLineId);
      if (editingLineId === subscriptionLineId) {
        resetSubscriptionLineForm();
      }
      await loadSubscriptionLines();
      Alert.alert(x("Deleted", "हटा दिया"), x("Subscription line deleted.", "सब्सक्रिप्शन लाइन हटा दी गई।"));
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Delete failed", "हटाना असफल"),
        e?.message ?? x("Could not delete subscription line.", "सब्सक्रिप्शन लाइन हट नहीं पाई।")
      );
    } finally {
      setPlannerSaving(false);
    }
  };

  const resetForm = () => {
    setEditingCustomerId(null);
    setCustomerName("");
    setCustomerType("RETAIL");
    setPhone("");
    setRouteName("");
    setCollectionPoint("");
    setSubscriptionActive(false);
    setDailySubscriptionQty("");
    setSubscriptionFrequency("DAILY");
    setDefaultMilkUnitPrice("");
    setSubscriptionPausedUntil("");
    setSubscriptionSkipDatesCsv("");
    setSubscriptionHolidayWeekdaysCsv("");
    setIsActive(true);
    setNotes("");
    setShowForm(false);
  };

  const openAddForm = () => {
    if (!canManageCustomers) {
      return;
    }
    resetForm();
    setShowForm(true);
  };

  const startEdit = (row: CustomerRecordResponse) => {
    if (!canManageCustomers) {
      return;
    }
    setEditingCustomerId(row.customerId);
    setCustomerName(row.customerName);
    setCustomerType(row.customerType);
    setPhone(row.phone ?? "");
    setRouteName(row.routeName ?? "");
    setCollectionPoint(row.collectionPoint ?? "");
    setSubscriptionActive(Boolean(row.subscriptionActive));
    setDailySubscriptionQty(row.dailySubscriptionQty == null ? "" : String(row.dailySubscriptionQty));
    setSubscriptionFrequency((row.subscriptionFrequency as SubscriptionFrequency | null) ?? "DAILY");
    setDefaultMilkUnitPrice(row.defaultMilkUnitPrice == null ? "" : String(row.defaultMilkUnitPrice));
    setSubscriptionPausedUntil(row.subscriptionPausedUntil ?? "");
    setSubscriptionSkipDatesCsv(normalizeSkipDatesCsv(row.subscriptionSkipDatesCsv).join(","));
    setSubscriptionHolidayWeekdaysCsv(normalizeDaysCsv(row.subscriptionHolidayWeekdaysCsv).join(","));
    setIsActive(row.isActive);
    setNotes(row.notes ?? "");
    setShowForm(true);
  };

  const saveCustomer = async () => {
    if (!canManageCustomers) {
      return;
    }
    if (!customerName.trim()) {
      Alert.alert(x("Missing details", "जानकारी अधूरी"), x("Customer name is required.", "ग्राहक नाम जरूरी है।"));
      return;
    }

    const qty = dailySubscriptionQty.trim() ? Number(dailySubscriptionQty) : null;
    if (qty != null && (!Number.isFinite(qty) || qty <= 0)) {
      Alert.alert(x("Invalid value", "गलत मान"), x("Daily quantity must be positive.", "दैनिक मात्रा पॉजिटिव रखें।"));
      return;
    }
    if (subscriptionActive && qty == null) {
      Alert.alert(
        x("Missing details", "जानकारी अधूरी"),
        x("Daily quantity is required for subscription customer.", "सब्सक्रिप्शन ग्राहक के लिए दैनिक मात्रा जरूरी है।")
      );
      return;
    }
    if (subscriptionActive && !subscriptionFrequency) {
      Alert.alert(
        x("Missing details", "जानकारी अधूरी"),
        x("Select subscription frequency.", "सब्सक्रिप्शन फ्रीक्वेंसी चुनें।")
      );
      return;
    }
    if (subscriptionPausedUntil.trim() && !ISO_DATE_REGEX.test(subscriptionPausedUntil.trim())) {
      Alert.alert(
        x("Invalid value", "गलत मान"),
        x("Pause until date must be YYYY-MM-DD.", "पॉज़-अनटिल तारीख YYYY-MM-DD फॉर्मेट में हो।")
      );
      return;
    }
    const normalizedSkipDates = normalizeSkipDatesCsv(subscriptionSkipDatesCsv);
    if (subscriptionSkipDatesCsv.trim() && normalizedSkipDates.length === 0) {
      Alert.alert(
        x("Invalid value", "गलत मान"),
        x("Skip dates must be comma-separated YYYY-MM-DD values.", "स्किप तारीखें YYYY-MM-DD (comma-separated) में डालें।")
      );
      return;
    }
    const normalizedHolidayWeekdays = normalizeDaysCsv(subscriptionHolidayWeekdaysCsv);
    if (subscriptionHolidayWeekdaysCsv.trim() && normalizedHolidayWeekdays.length === 0) {
      Alert.alert(
        x("Invalid value", "गलत मान"),
        x("Holiday weekdays must be comma-separated days like SUN,MON.", "हॉलिडे दिन SUN,MON जैसे comma-separated दें।")
      );
      return;
    }
    const price = defaultMilkUnitPrice.trim() ? Number(defaultMilkUnitPrice) : null;
    if (price != null && (!Number.isFinite(price) || price <= 0)) {
      Alert.alert(
        x("Invalid value", "गलत मान"),
        x("Default milk price must be positive.", "डिफ़ॉल्ट दूध कीमत पॉजिटिव रखें।")
      );
      return;
    }

    try {
      setSaving(true);
      const payload = {
        customerName: customerName.trim(),
        customerType,
        phone: phone.trim() || null,
        routeName: routeName.trim() || null,
        collectionPoint: collectionPoint.trim() || null,
        subscriptionActive,
        dailySubscriptionQty: subscriptionActive ? qty : null,
        subscriptionFrequency: subscriptionActive ? subscriptionFrequency : null,
        subscriptionPausedUntil: subscriptionActive ? subscriptionPausedUntil.trim() || null : null,
        subscriptionSkipDatesCsv: subscriptionActive ? normalizedSkipDates.join(",") || null : null,
        subscriptionHolidayWeekdaysCsv: subscriptionActive
          ? normalizedHolidayWeekdays.join(",") || null
          : null,
        defaultMilkUnitPrice: price,
        isActive,
        notes: notes.trim() || null,
      };
      if (editingCustomerId) {
        await CustomerApi.update(editingCustomerId, payload);
      } else {
        await CustomerApi.create(payload);
      }
      await loadCustomers();
      resetForm();
      Alert.alert(
        x("Saved", "सेव हो गया"),
        editingCustomerId ? x("Customer updated.", "ग्राहक अपडेट हो गया।") : x("Customer added.", "ग्राहक जोड़ दिया गया।")
      );
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not save customer.", "ग्राहक सेव नहीं हुआ।")
      );
    } finally {
      setSaving(false);
    }
  };

  const recordPayout = async (row: CustomerRecordResponse) => {
    if (!canManageCustomers) {
      Alert.alert(
        x("Role restricted", "रोल अनुमति नहीं"),
        x("Only ADMIN or MANAGER can record payouts.", "पेआउट रिकॉर्ड सिर्फ ADMIN या MANAGER कर सकता है।")
      );
      return;
    }
    const raw = payoutAmountByCustomer[row.customerId]?.trim() ?? "";
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert(
        x("Invalid value", "गलत मान"),
        x("Enter a valid payout amount.", "सही पेआउट राशि दर्ज करें।")
      );
      return;
    }

    try {
      setSaving(true);
      await CustomerApi.recordPayout(row.customerId, {
        amount,
        payoutDate: todayLocalISO(),
      });
      setPayoutAmountByCustomer((prev) => ({ ...prev, [row.customerId]: "" }));
      await loadCustomers();
      Alert.alert(x("Saved", "सेव हो गया"), x("Payout recorded.", "पेआउट रिकॉर्ड हो गया।"));
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not record payout.", "पेआउट रिकॉर्ड नहीं हुआ।")
      );
    } finally {
      setSaving(false);
    }
  };

  const summary = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.isActive).length;
    const subscriptions = rows.filter((r) => r.subscriptionActive).length;
    const outstanding = rows.reduce((acc, row) => acc + (row.runningBalance ?? 0), 0);
    return { total, active, subscriptions, outstanding };
  }, [rows]);

  const plannerCustomer = useMemo(
    () => rows.find((row) => row.customerId === plannerCustomerId) ?? null,
    [plannerCustomerId, rows]
  );

  const buildCustomerUpdatePayload = useCallback(
    (
      row: CustomerRecordResponse,
      overrides?: {
        subscriptionPausedUntil?: string | null;
        subscriptionSkipDatesCsv?: string | null;
        subscriptionHolidayWeekdaysCsv?: string | null;
        subscriptionActive?: boolean;
      }
    ) => {
      const nextSubscriptionActive = overrides?.subscriptionActive ?? row.subscriptionActive;
      return {
        customerName: row.customerName,
        customerType: row.customerType,
        phone: row.phone ?? null,
        routeName: row.routeName ?? null,
        collectionPoint: row.collectionPoint ?? null,
        subscriptionActive: nextSubscriptionActive,
        dailySubscriptionQty: nextSubscriptionActive ? row.dailySubscriptionQty ?? null : null,
        subscriptionFrequency: nextSubscriptionActive ? row.subscriptionFrequency ?? "DAILY" : null,
        subscriptionPausedUntil: nextSubscriptionActive
          ? (overrides?.subscriptionPausedUntil ?? row.subscriptionPausedUntil ?? null) || null
          : null,
        subscriptionSkipDatesCsv: nextSubscriptionActive
          ? (overrides?.subscriptionSkipDatesCsv ?? row.subscriptionSkipDatesCsv ?? null) || null
          : null,
        subscriptionHolidayWeekdaysCsv: nextSubscriptionActive
          ? (overrides?.subscriptionHolidayWeekdaysCsv ?? row.subscriptionHolidayWeekdaysCsv ?? null) || null
          : null,
        defaultMilkUnitPrice: row.defaultMilkUnitPrice ?? null,
        isActive: row.isActive,
        notes: row.notes ?? null,
      };
    },
    []
  );

  const updateSubscriptionLifecycle = useCallback(
    async (
      row: CustomerRecordResponse,
      overrides: {
        subscriptionPausedUntil?: string | null;
        subscriptionSkipDatesCsv?: string | null;
        subscriptionHolidayWeekdaysCsv?: string | null;
        subscriptionActive?: boolean;
      },
      successMessage: { en: string; hi: string }
    ) => {
      if (!canManageCustomers) {
        return;
      }
      try {
        setSaving(true);
        await CustomerApi.update(row.customerId, buildCustomerUpdatePayload(row, overrides));
        await loadCustomers();
        Alert.alert(x("Saved", "सेव हो गया"), x(successMessage.en, successMessage.hi));
      } catch (e: any) {
        console.error(e);
        Alert.alert(
          x("Save failed", "सेव नहीं हुआ"),
          e?.message ?? x("Could not update subscription lifecycle.", "सब्सक्रिप्शन लाइफसायकल अपडेट नहीं हुआ।")
        );
      } finally {
        setSaving(false);
      }
    },
    [buildCustomerUpdatePayload, canManageCustomers, loadCustomers, x]
  );

  return (
    <View style={{ flex: 1, backgroundColor: DairyColors.background }}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.customerId}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListHeaderComponent={
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
                  {x("Customers", "ग्राहक")}
                </Text>
                <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                  {x("Customer records and daily subscriptions", "ग्राहक रिकॉर्ड और दैनिक सब्सक्रिप्शन")}
                </Text>
              </View>
              <Pressable
                onPress={loadCustomers}
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

            {canManageCustomers ? (
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
                <Ionicons name="person-add" size={18} color="white" />
                <Text style={{ color: "white", fontWeight: "800" }}>{x("Add Customer", "ग्राहक जोड़ें")}</Text>
              </Pressable>
            ) : null}

            <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <View style={{ flex: 1, minWidth: 100, backgroundColor: DairyColors.accentSoft, borderRadius: 12, padding: 10 }}>
                <Text style={{ color: DairyColors.textSecondary }}>{x("Total", "कुल")}</Text>
                <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>{summary.total}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 100, backgroundColor: DairyColors.successSoft, borderRadius: 12, padding: 10 }}>
                <Text style={{ color: DairyColors.textSecondary }}>{x("Active", "सक्रिय")}</Text>
                <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>{summary.active}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 100, backgroundColor: DairyColors.infoSoft, borderRadius: 12, padding: 10 }}>
                <Text style={{ color: DairyColors.textSecondary }}>{x("Subscriptions", "सब्सक्रिप्शन")}</Text>
                <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>{summary.subscriptions}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 120, backgroundColor: DairyColors.warningSoft, borderRadius: 12, padding: 10 }}>
                <Text style={{ color: DairyColors.textSecondary }}>{x("Outstanding", "कुल बकाया")}</Text>
                <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>
                  {`Rs ${summary.outstanding.toFixed(2)}`}
                </Text>
              </View>
            </View>

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
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
                    {x("Subscription Planner", "सब्सक्रिप्शन प्लानर")}
                  </Text>
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                    {x(
                      "Plan by shift, product, day and preferred time.",
                      "शिफ्ट, प्रोडक्ट, दिन और पसंदीदा समय के हिसाब से प्लान बनाएं।"
                    )}
                  </Text>
                </View>
                <Pressable
                  onPress={() => void loadSubscriptionLines()}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    backgroundColor: DairyColors.surfaceMuted,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name={plannerLoading ? "sync-circle" : "refresh"} size={18} color={DairyColors.primary} />
                </Pressable>
              </View>

              <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {rows.map((row) => {
                  const selected = plannerCustomerId === row.customerId;
                  return (
                    <Pressable
                      key={row.customerId}
                      onPress={() => {
                        setPlannerCustomerId(row.customerId);
                        resetSubscriptionLineForm();
                      }}
                      style={{
                        borderWidth: 1,
                        borderColor: selected ? DairyColors.primary : DairyColors.border,
                        backgroundColor: selected ? DairyColors.primarySoft : DairyColors.surfaceMuted,
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                      }}
                    >
                      <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{row.customerName}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {plannerCustomer ? (
                <>
                  <Text style={{ marginTop: 10, color: DairyColors.textSecondary }}>
                    {x("Selected customer", "चुना हुआ ग्राहक")}: {plannerCustomer.customerName}
                  </Text>
                  {canManageCustomers ? (
                    <>
                      <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {SHIFT_OPTIONS.map((option) => (
                          <Pressable
                            key={option}
                            onPress={() => setLineShift(option)}
                            style={{
                              borderWidth: 1,
                              borderColor: lineShift === option ? DairyColors.primary : DairyColors.border,
                              backgroundColor: lineShift === option ? DairyColors.primarySoft : DairyColors.surface,
                              borderRadius: 999,
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                            }}
                          >
                            <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{option}</Text>
                          </Pressable>
                        ))}
                      </View>

                      <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {PRODUCT_OPTIONS.map((option) => (
                          <Pressable
                            key={option}
                            onPress={() => setLineProduct(option)}
                            style={{
                              borderWidth: 1,
                              borderColor: lineProduct === option ? DairyColors.primary : DairyColors.border,
                              backgroundColor: lineProduct === option ? DairyColors.primarySoft : DairyColors.surface,
                              borderRadius: 999,
                              paddingHorizontal: 10,
                              paddingVertical: 7,
                            }}
                          >
                            <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{label("productType", option)}</Text>
                          </Pressable>
                        ))}
                      </View>

                      <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
                        <TextInput
                          value={lineQty}
                          onChangeText={setLineQty}
                          placeholder={x("Qty", "मात्रा")}
                          placeholderTextColor="#99A99A"
                          keyboardType="decimal-pad"
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
                          value={lineUnitPrice}
                          onChangeText={setLineUnitPrice}
                          placeholder={x("Unit Price", "यूनिट कीमत")}
                          placeholderTextColor="#99A99A"
                          keyboardType="decimal-pad"
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
                          value={linePreferredTime}
                          onChangeText={setLinePreferredTime}
                          placeholder={x("Preferred time HH:mm", "पसंदीदा समय HH:mm")}
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
                        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                          <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{x("Active", "सक्रिय")}</Text>
                          <Switch value={lineActive} onValueChange={setLineActive} />
                        </View>
                      </View>

                      <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <DateInput
                            value={lineStartDate}
                            onChangeText={setLineStartDate}
                            placeholder={x("Start date (YYYY-MM-DD)", "शुरुआत तारीख (YYYY-MM-DD)")}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <DateInput
                            value={lineEndDate}
                            onChangeText={setLineEndDate}
                            placeholder={x("End date (YYYY-MM-DD)", "समाप्ति तारीख (YYYY-MM-DD)")}
                          />
                        </View>
                      </View>

                      <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {DAY_OPTIONS.map((day) => {
                          const selected = lineDays.includes(day);
                          return (
                            <Pressable
                              key={day}
                              onPress={() => toggleLineDay(day)}
                              style={{
                                borderWidth: 1,
                                borderColor: selected ? DairyColors.primary : DairyColors.border,
                                backgroundColor: selected ? DairyColors.primarySoft : DairyColors.surface,
                                borderRadius: 999,
                                paddingHorizontal: 10,
                                paddingVertical: 7,
                              }}
                            >
                              <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{day}</Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      <TextInput
                        value={lineNotes}
                        onChangeText={setLineNotes}
                        placeholder={x("Line notes (optional)", "लाइन नोट्स (वैकल्पिक)")}
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
                        <Pressable
                          disabled={plannerSaving}
                          onPress={() => void saveSubscriptionLine()}
                          style={{
                            flex: 1,
                            borderRadius: 10,
                            backgroundColor: plannerSaving ? DairyColors.textSecondary : DairyColors.primary,
                            paddingVertical: 11,
                            alignItems: "center",
                          }}
                        >
                          <Text style={{ color: "white", fontWeight: "800" }}>
                            {plannerSaving
                              ? x("Saving...", "सेव हो रहा है...")
                              : editingLineId
                                ? x("Update Line", "लाइन अपडेट करें")
                                : x("Add Line", "लाइन जोड़ें")}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={resetSubscriptionLineForm}
                          style={{
                            borderWidth: 1,
                            borderColor: DairyColors.border,
                            borderRadius: 10,
                            paddingHorizontal: 14,
                            justifyContent: "center",
                          }}
                        >
                          <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>{x("Clear", "हटाएं")}</Text>
                        </Pressable>
                      </View>
                    </>
                  ) : null}

                  <View style={{ marginTop: 10, gap: 8 }}>
                    {plannerRows.length === 0 ? (
                      <Text style={{ color: DairyColors.textSecondary }}>
                        {plannerLoading
                          ? x("Loading subscription lines...", "सब्सक्रिप्शन लाइन लोड हो रही हैं...")
                          : x("No subscription lines for this customer.", "इस ग्राहक के लिए कोई सब्सक्रिप्शन लाइन नहीं है।")}
                      </Text>
                    ) : (
                      plannerRows.map((line) => (
                        <View
                          key={line.subscriptionLineId}
                          style={{
                            borderWidth: 1,
                            borderColor: DairyColors.border,
                            borderRadius: 10,
                            backgroundColor: DairyColors.surfaceMuted,
                            padding: 10,
                          }}
                        >
                          <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                            {label("productType", line.productType)} | {line.taskShift} | {line.quantity.toFixed(2)}
                          </Text>
                          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                            {x("Price", "कीमत")}: Rs {line.unitPrice.toFixed(2)}
                            {line.preferredTime ? ` | ${x("Time", "समय")} ${line.preferredTime}` : ""}
                          </Text>
                          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                            {x("Days", "दिन")}: {normalizeDaysCsv(line.activeDaysCsv).join(", ") || x("Not set", "सेट नहीं")}
                          </Text>
                          {line.startDate || line.endDate ? (
                            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                              {x(
                                `Window: ${line.startDate ?? "-"} to ${line.endDate ?? "-"}`,
                                `अवधि: ${line.startDate ?? "-"} से ${line.endDate ?? "-"}`
                              )}
                            </Text>
                          ) : null}
                          {line.notes ? (
                            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>{line.notes}</Text>
                          ) : null}
                          <View style={{ marginTop: 6, flexDirection: "row", gap: 8 }}>
                            {canManageCustomers ? (
                              <>
                                <Pressable
                                  onPress={() => startEditSubscriptionLine(line)}
                                  style={{
                                    borderWidth: 1,
                                    borderColor: DairyColors.border,
                                    borderRadius: 10,
                                    backgroundColor: DairyColors.surface,
                                    paddingHorizontal: 12,
                                    paddingVertical: 8,
                                  }}
                                >
                                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{x("Edit", "बदलें")}</Text>
                                </Pressable>
                                <Pressable
                                  onPress={() => void deleteSubscriptionLine(line.subscriptionLineId)}
                                  style={{
                                    borderWidth: 1,
                                    borderColor: DairyColors.danger,
                                    borderRadius: 10,
                                    backgroundColor: DairyColors.dangerSoft,
                                    paddingHorizontal: 12,
                                    paddingVertical: 8,
                                  }}
                                >
                                  <Text style={{ color: DairyColors.danger, fontWeight: "700" }}>{x("Delete", "हटाएं")}</Text>
                                </Pressable>
                              </>
                            ) : null}
                            {!line.active ? (
                              <View
                                style={{
                                  borderRadius: 999,
                                  backgroundColor: DairyColors.warningSoft,
                                  paddingHorizontal: 10,
                                  paddingVertical: 6,
                                }}
                              >
                                <Text style={{ color: DairyColors.warning, fontWeight: "700" }}>
                                  {x("Inactive", "निष्क्रिय")}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                </>
              ) : null}
            </View>

            {showForm ? (
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
                  {editingCustomerId ? x("Edit Customer", "ग्राहक बदलें") : x("Add Customer", "ग्राहक जोड़ें")}
                </Text>

                <TextInput
                  value={customerName}
                  onChangeText={setCustomerName}
                  placeholder={x("Customer name", "ग्राहक नाम")}
                  placeholderTextColor="#99A99A"
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

                <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {CUSTOMER_TYPES.map((option) => (
                    <Pressable
                      key={option}
                      onPress={() => setCustomerType(option)}
                      style={{
                        borderWidth: 1,
                        borderColor: customerType === option ? DairyColors.primary : DairyColors.border,
                        backgroundColor: customerType === option ? DairyColors.primarySoft : DairyColors.surface,
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                      }}
                    >
                      <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{label("customerType", option)}</Text>
                    </Pressable>
                  ))}
                </View>

                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder={x("Phone (optional)", "मोबाइल (वैकल्पिक)")}
                  placeholderTextColor="#99A99A"
                  keyboardType="phone-pad"
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

                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <TextInput
                    value={routeName}
                    onChangeText={setRouteName}
                    placeholder={x("Route (optional)", "रूट (वैकल्पिक)")}
                    placeholderTextColor="#99A99A"
                    style={{
                      borderWidth: 1,
                      borderColor: DairyColors.border,
                      borderRadius: 10,
                      padding: 10,
                      color: DairyColors.textPrimary,
                      backgroundColor: DairyColors.surfaceMuted,
                      flex: 1,
                    }}
                  />
                  <TextInput
                    value={collectionPoint}
                    onChangeText={setCollectionPoint}
                    placeholder={x("Collection point", "कलेक्शन पॉइंट")}
                    placeholderTextColor="#99A99A"
                    style={{
                      borderWidth: 1,
                      borderColor: DairyColors.border,
                      borderRadius: 10,
                      padding: 10,
                      color: DairyColors.textPrimary,
                      backgroundColor: DairyColors.surfaceMuted,
                      flex: 1,
                    }}
                  />
                </View>

                <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                    {x("Daily subscription customer", "दैनिक सब्सक्रिप्शन ग्राहक")}
                  </Text>
                  <Switch value={subscriptionActive} onValueChange={setSubscriptionActive} />
                </View>

                {subscriptionActive ? (
                  <>
                    <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {SUBSCRIPTION_FREQUENCIES.map((option) => (
                        <Pressable
                          key={option}
                          onPress={() => setSubscriptionFrequency(option)}
                          style={{
                            borderWidth: 1,
                            borderColor:
                              subscriptionFrequency === option ? DairyColors.primary : DairyColors.border,
                            backgroundColor:
                              subscriptionFrequency === option ? DairyColors.primarySoft : DairyColors.surface,
                            borderRadius: 999,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                          }}
                        >
                          <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                            {option === "DAILY" ? x("Daily", "दैनिक") : x("Weekly", "साप्ताहिक")}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <TextInput
                      value={dailySubscriptionQty}
                      onChangeText={setDailySubscriptionQty}
                      placeholder={
                        subscriptionFrequency === "WEEKLY"
                          ? x("Weekly quantity (L)", "साप्ताहिक मात्रा (L)")
                          : x("Daily quantity (L)", "दैनिक मात्रा (L)")
                      }
                      placeholderTextColor="#99A99A"
                      keyboardType="decimal-pad"
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
                    <DateInput
                      value={subscriptionPausedUntil}
                      onChangeText={setSubscriptionPausedUntil}
                      placeholder={x("Pause until (YYYY-MM-DD)", "पॉज़-अनटिल (YYYY-MM-DD)")}
                    />
                    <TextInput
                      value={subscriptionSkipDatesCsv}
                      onChangeText={setSubscriptionSkipDatesCsv}
                      placeholder={x(
                        "Skip dates CSV (YYYY-MM-DD,YYYY-MM-DD)",
                        "स्किप तारीखें CSV (YYYY-MM-DD,YYYY-MM-DD)"
                      )}
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
                      value={subscriptionHolidayWeekdaysCsv}
                      onChangeText={setSubscriptionHolidayWeekdaysCsv}
                      placeholder={x(
                        "Weekly holidays CSV (SUN or SUN,MON)",
                        "साप्ताहिक छुट्टी CSV (SUN या SUN,MON)"
                      )}
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
                  </>
                ) : null}

                <TextInput
                  value={defaultMilkUnitPrice}
                  onChangeText={setDefaultMilkUnitPrice}
                  placeholder={x("Default milk price (Rs/L)", "डिफ़ॉल्ट दूध कीमत (रु/लीटर)")}
                  placeholderTextColor="#99A99A"
                  keyboardType="decimal-pad"
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

                <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{x("Active", "सक्रिय")}</Text>
                  <Switch value={isActive} onValueChange={setIsActive} />
                </View>

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
                  onPress={saveCustomer}
                  style={{
                    marginTop: 10,
                    borderRadius: 10,
                    paddingVertical: 12,
                    alignItems: "center",
                    backgroundColor: saving ? DairyColors.textSecondary : DairyColors.primary,
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "800" }}>
                    {saving
                      ? x("Saving...", "सेव हो रहा है...")
                      : editingCustomerId
                        ? x("Update Customer", "ग्राहक अपडेट करें")
                        : x("Add Customer", "ग्राहक जोड़ें")}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={resetForm}
                  style={{
                    marginTop: 8,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>{x("Cancel", "रद्द करें")}</Text>
                </Pressable>
              </View>
            ) : null}

            <Text style={{ marginTop: 14, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
              {x("Customer List", "ग्राहक सूची")}
            </Text>
          </>
        }
        renderItem={({ item }) => {
          const todayIsoDate = todayLocalISO();
          const skipDates = normalizeSkipDatesCsv(item.subscriptionSkipDatesCsv);
          const holidayWeekdays = normalizeDaysCsv(item.subscriptionHolidayWeekdaysCsv);
          const skipToday = skipDates.includes(todayIsoDate);
          return (
            <View
              style={{
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 12,
                backgroundColor: DairyColors.surface,
                padding: 12,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>{item.customerName}</Text>
                <View
                  style={{
                    borderRadius: 999,
                    backgroundColor: item.isActive ? DairyColors.successSoft : DairyColors.warningSoft,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                  }}
                >
                  <Text style={{ color: item.isActive ? DairyColors.success : DairyColors.warning, fontWeight: "700" }}>
                    {item.isActive ? x("Active", "सक्रिय") : x("Inactive", "निष्क्रिय")}
                  </Text>
                </View>
              </View>

              <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                {label("customerType", item.customerType)}
                {item.routeName ? ` | ${item.routeName}` : ""}
                {item.collectionPoint ? ` | ${item.collectionPoint}` : ""}
              </Text>
              {item.phone ? (
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>{item.phone}</Text>
              ) : null}
              {item.subscriptionActive ? (
                <Text style={{ marginTop: 4, color: DairyColors.info, fontWeight: "700" }}>
                  {x(
                    `${item.subscriptionFrequency === "WEEKLY" ? "Weekly" : "Daily"} subscription: ${item.dailySubscriptionQty ?? 0} L`,
                    `${item.subscriptionFrequency === "WEEKLY" ? "साप्ताहिक" : "दैनिक"} सब्सक्रिप्शन: ${item.dailySubscriptionQty ?? 0} L`
                  )}
                </Text>
              ) : null}
              {item.subscriptionPausedUntil ? (
                <Text style={{ marginTop: 2, color: DairyColors.warning, fontWeight: "700" }}>
                  {x(
                    `Subscription paused until ${item.subscriptionPausedUntil}`,
                    `सब्सक्रिप्शन ${item.subscriptionPausedUntil} तक पॉज़ है`
                  )}
                </Text>
              ) : null}
              {skipDates.length > 0 ? (
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x(`Skip dates: ${skipDates.join(", ")}`, `स्किप तारीखें: ${skipDates.join(", ")}`)}
                </Text>
              ) : null}
              {holidayWeekdays.length > 0 ? (
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x(
                    `Weekly holidays: ${holidayWeekdays.join(", ")}`,
                    `साप्ताहिक छुट्टियां: ${holidayWeekdays.join(", ")}`
                  )}
                </Text>
              ) : null}
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x(
                  `Default milk price: Rs ${(item.defaultMilkUnitPrice ?? 0).toFixed(2)}/L`,
                  `डिफ़ॉल्ट दूध कीमत: रु ${(item.defaultMilkUnitPrice ?? 0).toFixed(2)}/लीटर`
                )}
              </Text>
              <Text style={{ marginTop: 4, color: DairyColors.warning, fontWeight: "700" }}>
                {x(
                  `Running balance: Rs ${(item.runningBalance ?? 0).toFixed(2)}`,
                  `चलता बकाया: Rs ${(item.runningBalance ?? 0).toFixed(2)}`
                )}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x(
                  `Total paid: Rs ${(item.totalPaid ?? 0).toFixed(2)}${item.lastPayoutDate ? ` | Last payout: ${item.lastPayoutDate}` : ""}`,
                  `कुल भुगतान: Rs ${(item.totalPaid ?? 0).toFixed(2)}${item.lastPayoutDate ? ` | आखिरी पेआउट: ${item.lastPayoutDate}` : ""}`
                )}
              </Text>
              {item.notes ? (
                <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>{item.notes}</Text>
              ) : null}

              {canManageCustomers ? (
                <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <Pressable
                    onPress={() => startEdit(item)}
                    style={{
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

                  {item.subscriptionActive ? (
                    <>
                      <Pressable
                        disabled={saving}
                        onPress={() =>
                          void updateSubscriptionLifecycle(
                            item,
                            { subscriptionPausedUntil: todayIsoDate },
                            { en: "Subscription paused for today.", hi: "सब्सक्रिप्शन आज के लिए पॉज़ किया गया।" }
                          )
                        }
                        style={{
                          borderRadius: 10,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          backgroundColor: saving ? DairyColors.textSecondary : DairyColors.warning,
                        }}
                      >
                        <Text style={{ color: "white", fontWeight: "700" }}>{x("Pause Today", "आज पॉज़")}</Text>
                      </Pressable>
                      <Pressable
                        disabled={saving}
                        onPress={() =>
                          void updateSubscriptionLifecycle(
                            item,
                            { subscriptionPausedUntil: null },
                            { en: "Subscription resumed.", hi: "सब्सक्रिप्शन फिर चालू किया गया।" }
                          )
                        }
                        style={{
                          borderRadius: 10,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          backgroundColor: saving ? DairyColors.textSecondary : DairyColors.success,
                        }}
                      >
                        <Text style={{ color: "white", fontWeight: "700" }}>{x("Resume", "फिर चालू")}</Text>
                      </Pressable>
                      <Pressable
                        disabled={saving}
                        onPress={() =>
                          void updateSubscriptionLifecycle(
                            item,
                            {
                              subscriptionSkipDatesCsv: (skipToday
                                ? skipDates.filter((date) => date !== todayIsoDate)
                                : [...skipDates, todayIsoDate]
                              ).sort((a, b) => a.localeCompare(b)).join(","),
                            },
                            {
                              en: skipToday ? "Today removed from skip dates." : "Today added to skip dates.",
                              hi: skipToday ? "आज की तारीख स्किप सूची से हटाई गई।" : "आज की तारीख स्किप सूची में जोड़ी गई।",
                            }
                          )
                        }
                        style={{
                          borderRadius: 10,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          backgroundColor: saving ? DairyColors.textSecondary : DairyColors.info,
                        }}
                      >
                        <Text style={{ color: "white", fontWeight: "700" }}>
                          {skipToday ? x("Unskip Today", "आज अनस्किप") : x("Skip Today", "आज स्किप")}
                        </Text>
                      </Pressable>
                      {skipDates.length > 0 ? (
                        <Pressable
                          disabled={saving}
                          onPress={() =>
                            void updateSubscriptionLifecycle(
                              item,
                              { subscriptionSkipDatesCsv: null },
                              { en: "All skip dates cleared.", hi: "सारी स्किप तारीखें हटाई गईं।" }
                            )
                          }
                          style={{
                            borderWidth: 1,
                            borderColor: DairyColors.border,
                            borderRadius: 10,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            backgroundColor: DairyColors.surfaceMuted,
                          }}
                        >
                          <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                            {x("Clear Skips", "स्किप हटाएं")}
                          </Text>
                        </Pressable>
                      ) : null}
                    </>
                  ) : null}
                  {item.runningBalance > 0 ? (
                    <>
                      <TextInput
                        value={payoutAmountByCustomer[item.customerId] ?? ""}
                        onChangeText={(value) =>
                          setPayoutAmountByCustomer((prev) => ({ ...prev, [item.customerId]: value }))
                        }
                        placeholder={x("Payout amount", "पेआउट राशि")}
                        placeholderTextColor="#99A99A"
                        keyboardType="decimal-pad"
                        style={{
                          borderWidth: 1,
                          borderColor: DairyColors.border,
                          borderRadius: 10,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          minWidth: 120,
                          color: DairyColors.textPrimary,
                          backgroundColor: DairyColors.surfaceMuted,
                        }}
                      />
                      <Pressable
                        disabled={saving}
                        onPress={() => void recordPayout(item)}
                        style={{
                          borderRadius: 10,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          backgroundColor: saving ? DairyColors.textSecondary : DairyColors.primary,
                        }}
                      >
                        <Text style={{ color: "white", fontWeight: "700" }}>{x("Record Payout", "पेआउट दर्ज करें")}</Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
            {loading
              ? x("Loading customers...", "ग्राहक लोड हो रहे हैं...")
              : x("No customers found.", "कोई ग्राहक नहीं मिला।")}
          </Text>
        }
      />
    </View>
  );
}
