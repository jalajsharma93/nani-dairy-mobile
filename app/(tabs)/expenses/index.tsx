import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  ExpenseApi,
  ExpenseCategory,
  ExpenseResponse,
  ExpensesSummaryResponse,
  PaymentMode,
} from "@/src/services/api";
import { DairyColors } from "@/src/constants/dairy-theme";
import { todayLocalISO } from "@/src/utils/date";
import {
  getPendingSyncSummary,
  PendingSyncSummary,
  queueExpenseSave,
  shouldQueueForOffline,
} from "@/src/utils/offline-sync";
import { useAuth } from "@/src/state/auth";
import { useI18n } from "@/src/state/i18n";
import { resolveRolePermissions } from "@/src/state/permissions";
import { DateInput } from "../../../components/date-input";

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "SALARY",
  "FEED",
  "VETERINARY",
  "ELECTRICITY",
  "WATER",
  "EQUIPMENT",
  "MAINTENANCE",
  "TRANSPORT",
  "MISC",
];
const PAYMENT_MODES: PaymentMode[] = ["CASH", "UPI", "BANK_TRANSFER", "CARD", "CREDIT"];

const money = (value: number) => `Rs ${value.toFixed(2)}`;

export default function ExpensesScreen() {
  const { user } = useAuth();
  const { x, label } = useI18n();
  const permissions = resolveRolePermissions(user?.role);
  const canManageExpenses = permissions.canManageExpenses;

  const [date, setDate] = useState(todayLocalISO());
  const [expenses, setExpenses] = useState<ExpenseResponse[]>([]);
  const [summary, setSummary] = useState<ExpensesSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
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

  const [expenseDate, setExpenseDate] = useState(todayLocalISO());
  const [category, setCategory] = useState<ExpenseCategory>("SALARY");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("CASH");
  const [amount, setAmount] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");

  const resetForm = () => {
    setEditingExpenseId(null);
    setExpenseDate(date);
    setCategory("SALARY");
    setPaymentMode("CASH");
    setAmount("");
    setCounterparty("");
    setReferenceNo("");
    setNotes("");
  };

  const loadData = useCallback(async () => {
    if (!canManageExpenses) {
      setExpenses([]);
      setSummary(null);
      return;
    }

    try {
      setLoading(true);
      const [list, summaryRes] = await Promise.all([
        ExpenseApi.list({ date }),
        ExpenseApi.summary(date),
      ]);
      setExpenses(list);
      setSummary(summaryRes);
      if (!editingExpenseId) {
        setExpenseDate(date);
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load expenses.", "खर्चे लोड नहीं हो पाए।")
      );
    } finally {
      setLoading(false);
    }
  }, [canManageExpenses, date, editingExpenseId, x]);

  const refreshPendingSync = useCallback(async () => {
    setPendingSync(await getPendingSyncSummary());
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    void refreshPendingSync();
  }, [refreshPendingSync]);

  const saveExpense = async () => {
    if (!canManageExpenses) {
      Alert.alert(
        x("Admin only", "सिर्फ एडमिन"),
        x("Expense management is ADMIN only.", "खर्च प्रबंधन सिर्फ ADMIN कर सकता है।")
      );
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate.trim())) {
      Alert.alert(
        x("Invalid date", "गलत तारीख"),
        x("Expense date must be in YYYY-MM-DD format.", "खर्च तारीख YYYY-MM-DD में डालें।")
      );
      return;
    }

    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert(
        x("Invalid amount", "गलत राशि"),
        x("Amount must be a positive number.", "राशि पॉजिटिव संख्या होनी चाहिए।")
      );
      return;
    }

    try {
      setSaving(true);
      const payload = {
        expenseDate: expenseDate.trim(),
        category,
        amount: value,
        paymentMode,
        counterparty: counterparty.trim() || null,
        referenceNo: referenceNo.trim() || null,
        notes: notes.trim() || null,
      };

      if (editingExpenseId) {
        await ExpenseApi.update(editingExpenseId, payload);
      } else {
        await ExpenseApi.create(payload);
      }

      resetForm();
      await loadData();
      Alert.alert(
        x("Saved", "सेव हो गया"),
        editingExpenseId ? x("Expense updated.", "खर्च अपडेट हो गया।") : x("Expense added.", "खर्च जोड़ दिया गया।")
      );
    } catch (e: any) {
      console.error(e);
      if (shouldQueueForOffline(e)) {
        await queueExpenseSave(
          {
            expenseId: editingExpenseId,
            payload: {
              expenseDate: expenseDate.trim(),
              category,
              amount: value,
              paymentMode,
              counterparty: counterparty.trim() || null,
              referenceNo: referenceNo.trim() || null,
              notes: notes.trim() || null,
            },
          },
          String(e?.message ?? "")
        );
        await refreshPendingSync();
        resetForm();
        Alert.alert(
          x("Saved Offline", "ऑफलाइन सेव"),
          x("Expense is queued and will sync automatically.", "खर्च कतार में है और अपने-आप सिंक होगा।")
        );
        return;
      }
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not save expense.", "खर्च सेव नहीं हो पाया।")
      );
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: ExpenseResponse) => {
    if (!canManageExpenses) {
      return;
    }
    setEditingExpenseId(item.expenseId);
    setExpenseDate(item.expenseDate);
    setCategory(item.category);
    setPaymentMode(item.paymentMode);
    setAmount(String(item.amount));
    setCounterparty(item.counterparty ?? "");
    setReferenceNo(item.referenceNo ?? "");
    setNotes(item.notes ?? "");
  };

  const dailyTotal = useMemo(
    () => expenses.reduce((sum, row) => sum + row.amount, 0),
    [expenses]
  );
  const expensePendingCount = pendingSync.expenseSave;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: DairyColors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
            {x("Expenses", "खर्चे")}
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x("Salary and farm operating expenses", "सैलरी और फार्म चलाने के खर्चे")}
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

      <DateInput
        value={date}
        onChangeText={setDate}
        placeholder={x("Date (YYYY-MM-DD)", "तारीख (YYYY-MM-DD)")}
      />

      <View
        style={{
          marginTop: 10,
          borderWidth: 1,
          borderColor: DairyColors.border,
          borderRadius: 10,
          backgroundColor: expensePendingCount > 0 ? DairyColors.warningSoft : DairyColors.successSoft,
          padding: 10,
        }}
      >
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
          {expensePendingCount > 0 ? x("Expense Sync Pending", "खर्च सिंक बाकी") : x("Expense Synced", "खर्च सिंक")}
        </Text>
        <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
          {x(
            `Queued expense saves ${pendingSync.expenseSave} | Dead letter ${pendingSync.deadLetter}`,
            `कतार में खर्च सेव ${pendingSync.expenseSave} | डेड लेटर ${pendingSync.deadLetter}`
          )}
        </Text>
      </View>

      {canManageExpenses ? (
        <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <View style={{ flex: 1, minWidth: 120, borderRadius: 12, padding: 10, backgroundColor: DairyColors.accentSoft }}>
            <Text style={{ color: DairyColors.textSecondary }}>{x("Total Expense", "कुल खर्च")}</Text>
            <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>
              {money(summary?.totalAmount ?? dailyTotal)}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 120, borderRadius: 12, padding: 10, backgroundColor: DairyColors.warningSoft }}>
            <Text style={{ color: DairyColors.textSecondary }}>{x("Salary Expense", "सैलरी खर्च")}</Text>
            <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>
              {money(summary?.salaryAmount ?? 0)}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 120, borderRadius: 12, padding: 10, backgroundColor: DairyColors.infoSoft }}>
            <Text style={{ color: DairyColors.textSecondary }}>{x("Other Expense", "अन्य खर्च")}</Text>
            <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>
              {money(summary?.otherAmount ?? 0)}
            </Text>
          </View>
        </View>
      ) : null}

      {canManageExpenses ? (
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
          <Text style={{ fontWeight: "800", color: DairyColors.textPrimary, fontSize: 16 }}>
            {editingExpenseId ? x("Edit Expense", "खर्च बदलें") : x("Add Expense", "खर्च जोड़ें")}
          </Text>

          <DateInput
            value={expenseDate}
            onChangeText={setExpenseDate}
            placeholder={x("Expense date (YYYY-MM-DD)", "खर्च तारीख (YYYY-MM-DD)")}
          />

          <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
            {x("Category", "श्रेणी")}
          </Text>
          <View style={{ marginTop: 6, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {EXPENSE_CATEGORIES.map((option) => (
              <Pressable
                key={option}
                onPress={() => setCategory(option)}
                style={{
                  borderWidth: 1,
                  borderColor: category === option ? DairyColors.primary : DairyColors.border,
                  backgroundColor: category === option ? DairyColors.primarySoft : DairyColors.surface,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                  {label("expenseCategory", option)}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder={x("Amount", "राशि")}
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

          <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
            {x("Payment Mode", "भुगतान तरीका")}
          </Text>
          <View style={{ marginTop: 6, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {PAYMENT_MODES.map((option) => (
              <Pressable
                key={option}
                onPress={() => setPaymentMode(option)}
                style={{
                  borderWidth: 1,
                  borderColor: paymentMode === option ? DairyColors.primary : DairyColors.border,
                  backgroundColor: paymentMode === option ? DairyColors.primarySoft : DairyColors.surface,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                  {label("paymentMode", option)}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            value={counterparty}
            onChangeText={setCounterparty}
            placeholder={x("Paid to / Vendor / Employee (optional)", "किसको भुगतान किया (वैकल्पिक)")}
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
            value={referenceNo}
            onChangeText={setReferenceNo}
            placeholder={x("Reference no (UPI Txn / Bill no) (optional)", "रेफरेंस नंबर (UPI/बिल) (वैकल्पिक)")}
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
            onPress={saveExpense}
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
                : editingExpenseId
                  ? x("Update Expense", "खर्च अपडेट करें")
                  : x("Add Expense", "खर्च जोड़ें")}
            </Text>
          </Pressable>

          {editingExpenseId ? (
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
        <Text style={{ fontWeight: "800", color: DairyColors.textPrimary }}>
          {x(`Expenses (${date})`, `खर्चे (${date})`)}
        </Text>

        {expenses.length === 0 ? (
          <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
            {loading
              ? x("Loading expenses...", "खर्चे लोड हो रहे हैं...")
              : x("No expenses found for selected date.", "चुनी तारीख पर कोई खर्च नहीं मिला।")}
          </Text>
        ) : (
          expenses.map((item) => (
            <View
              key={item.expenseId}
              style={{
                marginTop: 8,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: DairyColors.border,
                padding: 10,
                backgroundColor: DairyColors.surfaceMuted,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                {label("expenseCategory", item.category)} | {money(item.amount)}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x("Payment", "भुगतान")}: {label("paymentMode", item.paymentMode)}
              </Text>
              {item.counterparty ? (
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x("Paid to", "किसको भुगतान")}: {item.counterparty}
                </Text>
              ) : null}
              {item.referenceNo ? (
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x("Ref", "रेफ")}: {item.referenceNo}
                </Text>
              ) : null}
              {item.notes ? (
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x("Note", "नोट")}: {item.notes}
                </Text>
              ) : null}

              {canManageExpenses ? (
                <Pressable
                  onPress={() => startEdit(item)}
                  style={{
                    marginTop: 8,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    alignSelf: "flex-start",
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    backgroundColor: DairyColors.surface,
                  }}
                >
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{x("Edit", "बदलें")}</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
