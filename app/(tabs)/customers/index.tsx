import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Switch, Text, TextInput, View } from "react-native";
import {
  CustomerApi,
  CustomerRecordResponse,
  CustomerType,
  SubscriptionFrequency,
} from "../../services/api";
import { DairyColors } from "../../constants/dairy-theme";
import { useAuth } from "../../state/auth";
import { useI18n } from "../../state/i18n";
import { todayLocalISO } from "../../utils/date";

const CUSTOMER_TYPES: CustomerType[] = ["COOPERATIVE", "RETAIL", "INDIVIDUAL"];
const SUBSCRIPTION_FREQUENCIES: SubscriptionFrequency[] = ["DAILY", "WEEKLY"];

export default function CustomersScreen() {
  const { hasAnyRole } = useAuth();
  const { x, label } = useI18n();
  const canManageCustomers = hasAnyRole("ADMIN", "MANAGER");

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
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState("");
  const [payoutAmountByCustomer, setPayoutAmountByCustomer] = useState<Record<string, string>>({});

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
                  </>
                ) : null}

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
        renderItem={({ item }) => (
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
        )}
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
