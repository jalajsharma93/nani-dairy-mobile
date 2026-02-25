import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  CreateSalePayload,
  CustomerApi,
  CustomerRecordResponse,
  DeliveryChecklistItemResponse,
  CustomerLedgerRowResponse,
  CustomerType,
  PaymentMode,
  ProductType,
  SaleResponse,
  SaleOverrideAuditResponse,
  SettlementCycle,
  SettlementReconciliationRowResponse,
  SalesApi,
  SalesSummaryResponse,
  Shift,
} from "../../services/api";
import { DairyColors } from "../../constants/dairy-theme";
import { shiftIsoDate, todayLocalISO } from "../../utils/date";
import { useAuth } from "../../state/auth";
import { useI18n } from "../../state/i18n";
import { ReadOnlyBanner } from "../../../components/read-only-banner";

const CUSTOMER_TYPES: CustomerType[] = ["COOPERATIVE", "RETAIL", "INDIVIDUAL"];
const PRODUCT_TYPES: ProductType[] = ["MILK", "GHEE", "CURD", "PANEER", "BUTTERMILK", "DUNG", "COMPOST"];
const PAYMENT_MODES: PaymentMode[] = ["CASH", "UPI", "BANK_TRANSFER", "CARD", "CREDIT"];
const SETTLEMENT_CYCLES: SettlementCycle[] = ["DAILY", "WEEKLY", "FORTNIGHTLY", "MONTHLY"];
const DEFAULT_CUSTOMERS = [
  "Daily Subscription - Route A",
  "Daily Subscription - Route B",
  "Shree Milk Cooperative",
];

const amount = (value: number) => `Rs ${value.toFixed(2)}`;

function paymentTone(status: SaleResponse["paymentStatus"]) {
  if (status === "PAID") {
    return { text: DairyColors.success, background: DairyColors.successSoft };
  }
  if (status === "PARTIAL") {
    return { text: DairyColors.warning, background: DairyColors.warningSoft };
  }
  return { text: DairyColors.danger, background: DairyColors.dangerSoft };
}

export default function SalesScreen() {
  const { hasAnyRole } = useAuth();
  const { x, label } = useI18n();
  const canManageSales = hasAnyRole("ADMIN", "MANAGER");
  const canDeliveryChecklist = hasAnyRole("ADMIN", "MANAGER", "WORKER", "DELIVERY");
  const isDeliveryOnly = canDeliveryChecklist && !canManageSales;

  const [sales, setSales] = useState<SaleResponse[]>([]);
  const [deliveryItems, setDeliveryItems] = useState<DeliveryChecklistItemResponse[]>([]);
  const [customerRecords, setCustomerRecords] = useState<CustomerRecordResponse[]>([]);
  const [summary, setSummary] = useState<SalesSummaryResponse | null>(null);
  const [ledgerRows, setLedgerRows] = useState<CustomerLedgerRowResponse[]>([]);
  const [reconciliationRows, setReconciliationRows] = useState<SettlementReconciliationRowResponse[]>([]);
  const [overrideAudits, setOverrideAudits] = useState<SaleOverrideAuditResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deliverySavingSaleId, setDeliverySavingSaleId] = useState<string | null>(null);
  const [deliveryCollectedBySaleId, setDeliveryCollectedBySaleId] = useState<Record<string, string>>({});
  const [reconcilingSaleId, setReconcilingSaleId] = useState<string | null>(null);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);

  const [dispatchDate, setDispatchDate] = useState(todayLocalISO());
  const [customerType, setCustomerType] = useState<CustomerType>("RETAIL");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [customers, setCustomers] = useState<string[]>(DEFAULT_CUSTOMERS);
  const [productType, setProductType] = useState<ProductType>("MILK");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("CASH");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [batchDate, setBatchDate] = useState(todayLocalISO());
  const [batchShift, setBatchShift] = useState<Shift>("AM");
  const [routeName, setRouteName] = useState("");
  const [collectionPoint, setCollectionPoint] = useState("");
  const [fatPercent, setFatPercent] = useState("");
  const [snfPercent, setSnfPercent] = useState("");
  const [fatRatePerKg, setFatRatePerKg] = useState("");
  const [snfRatePerKg, setSnfRatePerKg] = useState("");
  const [settlementCycle, setSettlementCycle] = useState<SettlementCycle>("MONTHLY");
  const [overrideWithdrawalLock, setOverrideWithdrawalLock] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [notes, setNotes] = useState("");

  const customerTypeLabel = (type: CustomerType) => label("customerType", type);
  const productTypeLabel = (type: ProductType) => label("productType", type);

  const mergeCustomers = (current: string[], incoming: string[]) => {
    const next = new Set(current);
    incoming.forEach((name) => {
      if (name.trim()) {
        next.add(name);
      }
    });
    return Array.from(next);
  };

  const findCustomerRecordByName = useCallback(
    (name: string) => customerRecords.find((row) => row.customerName === name) ?? null,
    [customerRecords]
  );

  const applyCustomerDefaults = useCallback((row: CustomerRecordResponse | null) => {
    if (!row) {
      return;
    }
    setCustomerId(row.customerId);
    setCustomerType(row.customerType);
    if (row.routeName && !routeName.trim()) {
      setRouteName(row.routeName);
    }
    if (row.collectionPoint && !collectionPoint.trim()) {
      setCollectionPoint(row.collectionPoint);
    }
  }, [collectionPoint, routeName]);

  const loadCustomers = useCallback(async () => {
    try {
      const rows = await CustomerApi.list({ active: true });
      setCustomerRecords(rows);
      setCustomers((prev) => mergeCustomers(prev, rows.map((r) => r.customerName)));
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadSales = useCallback(async () => {
    if (!canManageSales) {
      setSales([]);
      setSummary(null);
      setLedgerRows([]);
      setReconciliationRows([]);
      setOverrideAudits([]);
      return;
    }
    try {
      setLoading(true);
      const auditFromDate = shiftIsoDate(dispatchDate, -7);
      const reconciliationFromDate = shiftIsoDate(dispatchDate, -30);
      const [list, summaryRes, ledgerRes, overrideRes, reconciliationRes] = await Promise.all([
        SalesApi.list({ date: dispatchDate }),
        SalesApi.summary(dispatchDate),
        SalesApi.ledger(dispatchDate, dispatchDate),
        SalesApi.overrideAudits(auditFromDate, dispatchDate),
        SalesApi.reconciliation(reconciliationFromDate, dispatchDate),
      ]);
      setSales(list);
      setSummary(summaryRes);
      setLedgerRows(ledgerRes);
      setOverrideAudits(overrideRes);
      setReconciliationRows(reconciliationRes);
      setCustomers((prev) => mergeCustomers(prev, list.map((s) => s.customerName)));
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load sales.", "बिक्री डेटा लोड नहीं हो पाया।")
      );
    } finally {
      setLoading(false);
    }
  }, [canManageSales, dispatchDate, x]);

  const loadDelivery = useCallback(async () => {
    if (!canDeliveryChecklist) {
      setDeliveryItems([]);
      return;
    }
    try {
      setDeliveryLoading(true);
      const rows = await SalesApi.deliveryList(dispatchDate);
      setDeliveryItems(rows);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load delivery checklist.", "डिलीवरी लिस्ट लोड नहीं हो पाई।")
      );
    } finally {
      setDeliveryLoading(false);
    }
  }, [canDeliveryChecklist, dispatchDate, x]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  useEffect(() => {
    loadDelivery();
  }, [loadDelivery]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const refreshAll = useCallback(() => {
    void loadSales();
    void loadDelivery();
    void loadCustomers();
  }, [loadCustomers, loadDelivery, loadSales]);

  const totalPreview = useMemo(() => {
    const q = Number(quantity);
    const up = Number(unitPrice);
    return Number.isFinite(q) && Number.isFinite(up) ? q * up : 0;
  }, [quantity, unitPrice]);

  const isCooperativeMilk = customerType === "COOPERATIVE" && productType === "MILK";

  const qualitySettlementPreview = useMemo(() => {
    if (!isCooperativeMilk) {
      return null;
    }
    const q = Number(quantity);
    const fat = Number(fatPercent);
    const snf = Number(snfPercent);
    const fatRate = Number(fatRatePerKg);
    const snfRate = Number(snfRatePerKg);
    if (
      !Number.isFinite(q) ||
      q <= 0 ||
      !Number.isFinite(fat) ||
      fat <= 0 ||
      !Number.isFinite(snf) ||
      snf <= 0 ||
      !Number.isFinite(fatRate) ||
      fatRate <= 0 ||
      !Number.isFinite(snfRate) ||
      snfRate <= 0
    ) {
      return null;
    }
    const fatKg = (q * fat) / 100;
    const snfKg = (q * snf) / 100;
    const total = fatKg * fatRate + snfKg * snfRate;
    return { unitPrice: total / q, total };
  }, [isCooperativeMilk, quantity, fatPercent, snfPercent, fatRatePerKg, snfRatePerKg]);

  const totalPreviewDisplay = qualitySettlementPreview?.total ?? totalPreview;

  const addNewCustomer = async () => {
    if (!canManageSales) {
      Alert.alert(
        x("Role restricted", "रोल अनुमति नहीं"),
        x("Only ADMIN or MANAGER users can manage sales.", "बिक्री प्रबंधन सिर्फ ADMIN या MANAGER कर सकता है।")
      );
      return;
    }
    const name = newCustomerName.trim();
    if (!name) {
      return;
    }
    try {
      const existing = findCustomerRecordByName(name);
      let selected = existing;
      if (!existing) {
        const created = await CustomerApi.create({
          customerName: name,
          customerType,
          routeName: routeName.trim() || null,
          collectionPoint: collectionPoint.trim() || null,
          subscriptionActive: false,
          subscriptionFrequency: null,
          isActive: true,
        });
        selected = created;
        setCustomerRecords((prev) => [created, ...prev]);
      }
      setCustomers((prev) => (prev.includes(name) ? prev : [name, ...prev]));
      setCustomerId(selected?.customerId ?? null);
      setCustomerName(name);
      setNewCustomerName("");
      applyCustomerDefaults(selected);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not add customer.", "ग्राहक नहीं जुड़ पाया।")
      );
    }
  };

  const resetForm = () => {
    setEditingSaleId(null);
    setCustomerType("RETAIL");
    setCustomerId(null);
    setCustomerName("");
    setProductType("MILK");
    setPaymentMode("CASH");
    setQuantity("");
    setUnitPrice("");
    setReceivedAmount("");
    setBatchDate(dispatchDate);
    setBatchShift("AM");
    setRouteName("");
    setCollectionPoint("");
    setFatPercent("");
    setSnfPercent("");
    setFatRatePerKg("");
    setSnfRatePerKg("");
    setSettlementCycle("MONTHLY");
    setOverrideWithdrawalLock(false);
    setOverrideReason("");
    setNotes("");
  };

  const buildPayload = (): CreateSalePayload | null => {
    if (!customerName.trim()) {
      Alert.alert(
        x("Missing details", "जानकारी अधूरी"),
        x("Select existing customer or add a new one.", "पुराना ग्राहक चुनें या नया ग्राहक जोड़ें।")
      );
      return null;
    }

    const q = Number(quantity);
    const up = Number(unitPrice);
    const received = receivedAmount.trim() ? Number(receivedAmount) : 0;

    if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(up) || up <= 0) {
      Alert.alert(
        x("Invalid values", "गलत मान"),
        x("Quantity and Unit Price must be positive numbers.", "मात्रा और यूनिट कीमत पॉजिटिव होनी चाहिए।")
      );
      return null;
    }

    const fat = fatPercent.trim() ? Number(fatPercent) : null;
    const snf = snfPercent.trim() ? Number(snfPercent) : null;
    const fatRate = fatRatePerKg.trim() ? Number(fatRatePerKg) : null;
    const snfRate = snfRatePerKg.trim() ? Number(snfRatePerKg) : null;
    const hasQualityInput = fat !== null || snf !== null || fatRate !== null || snfRate !== null;
    let totalForReceivedCheck = q * up;

    if (isCooperativeMilk && !routeName.trim()) {
      Alert.alert(
        x("Missing details", "जानकारी अधूरी"),
        x("Route name is required for cooperative milk sale.", "कोऑपरेटिव दूध बिक्री के लिए रूट नाम जरूरी है।")
      );
      return null;
    }

    if (isCooperativeMilk && hasQualityInput) {
      if (
        fat === null ||
        snf === null ||
        fatRate === null ||
        snfRate === null ||
        !Number.isFinite(fat) ||
        fat <= 0 ||
        !Number.isFinite(snf) ||
        snf <= 0 ||
        !Number.isFinite(fatRate) ||
        fatRate <= 0 ||
        !Number.isFinite(snfRate) ||
        snfRate <= 0
      ) {
        Alert.alert(
          x("Invalid values", "गलत मान"),
          x(
            "For cooperative settlement, fat%, SNF%, fat rate and SNF rate must all be positive.",
            "कोऑपरेटिव सेटलमेंट के लिए Fat%, SNF%, Fat rate और SNF rate सभी पॉजिटिव होने चाहिए।"
          )
        );
        return null;
      }
      totalForReceivedCheck = (q * fat * fatRate) / 100 + (q * snf * snfRate) / 100;
    }

    if (!Number.isFinite(received) || received < 0 || received > totalForReceivedCheck) {
      Alert.alert(
        x("Invalid values", "गलत मान"),
        x("Received amount must be between 0 and total amount.", "मिला भुगतान 0 और कुल राशि के बीच होना चाहिए।")
      );
      return null;
    }

    if (productType === "MILK" && !batchDate) {
      Alert.alert(
        x("Missing batch", "बैच जानकारी अधूरी"),
        x("Milk sale requires batch date and shift.", "दूध बिक्री के लिए बैच तारीख और शिफ्ट जरूरी है।")
      );
      return null;
    }

    if (productType === "MILK" && overrideWithdrawalLock && !overrideReason.trim()) {
      Alert.alert(
        x("Missing override reason", "ओवरराइड कारण अधूरा"),
        x(
          "Enter override reason to approve withdrawal exception.",
          "Withdrawal exception के लिए override reason दर्ज करें।"
        )
      );
      return null;
    }

    return {
      dispatchDate,
      customerType,
      customerId: customerId?.trim() || null,
      customerName: customerName.trim(),
      productType,
      quantity: q,
      unitPrice: up,
      receivedAmount: received,
      paymentMode,
      batchDate: productType === "MILK" ? batchDate : null,
      batchShift: productType === "MILK" ? batchShift : null,
      notes: notes.trim() || null,
      routeName: isCooperativeMilk ? routeName.trim() || null : null,
      collectionPoint: isCooperativeMilk ? collectionPoint.trim() || null : null,
      fatPercent: isCooperativeMilk && hasQualityInput ? fat : null,
      snfPercent: isCooperativeMilk && hasQualityInput ? snf : null,
      fatRatePerKg: isCooperativeMilk && hasQualityInput ? fatRate : null,
      snfRatePerKg: isCooperativeMilk && hasQualityInput ? snfRate : null,
      settlementCycle: isCooperativeMilk ? settlementCycle : null,
      overrideWithdrawalLock: productType === "MILK" ? overrideWithdrawalLock : false,
      overrideReason:
        productType === "MILK" && overrideWithdrawalLock ? overrideReason.trim() : null,
    };
  };

  const saveSale = async () => {
    if (!canManageSales) {
      Alert.alert(
        x("Role restricted", "रोल अनुमति नहीं"),
        x("Only ADMIN or MANAGER users can manage sales.", "बिक्री प्रबंधन सिर्फ ADMIN या MANAGER कर सकता है।")
      );
      return;
    }

    const payload = buildPayload();
    if (!payload) {
      return;
    }

    try {
      setSaving(true);
      if (editingSaleId) {
        await SalesApi.update(editingSaleId, payload);
      } else {
        await SalesApi.create(payload);
      }
      resetForm();
      await loadSales();
      Alert.alert(
        x("Saved", "सेव हो गया"),
        editingSaleId ? x("Sale updated.", "बिक्री अपडेट हो गई।") : x("Sale created.", "बिक्री जोड़ दी गई।")
      );
    } catch (e: any) {
      console.error(e);
      const message = String(e?.message ?? x("Could not save sale.", "बिक्री सेव नहीं हो पाई।"));
      if (message.includes("HTTP 403")) {
        Alert.alert(
          x("Role restricted", "रोल अनुमति नहीं"),
          x("Only ADMIN or MANAGER users can manage sales.", "बिक्री प्रबंधन सिर्फ ADMIN या MANAGER कर सकता है।")
        );
      } else if (message.toLowerCase().includes("withdrawal period active")) {
        Alert.alert(
          x("Sale blocked", "बिक्री रुकी"),
          x(
            "This milk batch has animals under medicine withdrawal period. Choose another PASS batch or wait until withdrawal ends.",
            "इस दूध बैच में कुछ जानवर दवा के withdrawal period में हैं। दूसरा PASS बैच चुनें या withdrawal खत्म होने तक इंतजार करें।"
          )
        );
      } else if (message.toLowerCase().includes("override reason is required")) {
        Alert.alert(
          x("Missing override reason", "ओवरराइड कारण अधूरा"),
          x(
            "Override reason is required for withdrawal exception.",
            "Withdrawal exception के लिए override reason जरूरी है।"
          )
        );
      } else if (message.toLowerCase().includes("only pass qc milk batch can be sold")) {
        Alert.alert(
          x("Sale blocked", "बिक्री रुकी"),
          x("Only PASS QC milk batch can be sold.", "सिर्फ PASS QC वाला दूध बैच ही बिक सकता है।")
        );
      } else if (message.toLowerCase().includes("route name is required")) {
        Alert.alert(
          x("Missing route", "रूट जरूरी है"),
          x(
            "Route name is required for cooperative milk sale.",
            "कोऑपरेटिव दूध बिक्री के लिए रूट नाम जरूरी है।"
          )
        );
      } else if (message.toLowerCase().includes("provide fat%, snf%, fat rate and snf rate together")) {
        Alert.alert(
          x("Incomplete settlement inputs", "सेटलमेंट जानकारी अधूरी"),
          x(
            "Enter Fat%, SNF%, Fat rate and SNF rate together.",
            "Fat%, SNF%, Fat rate और SNF rate चारों साथ में भरें।"
          )
        );
      } else {
        Alert.alert(x("Save failed", "सेव नहीं हुआ"), message);
      }
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (sale: SaleResponse) => {
    if (!canManageSales) {
      Alert.alert(
        x("Role restricted", "रोल अनुमति नहीं"),
        x("Only ADMIN or MANAGER users can manage sales.", "बिक्री प्रबंधन सिर्फ ADMIN या MANAGER कर सकता है।")
      );
      return;
    }

    setEditingSaleId(sale.saleId);
    setDispatchDate(sale.dispatchDate);
    setCustomerType(sale.customerType);
    setCustomerId(sale.customerId ?? findCustomerRecordByName(sale.customerName)?.customerId ?? null);
    setCustomerName(sale.customerName);
    setProductType(sale.productType);
    setPaymentMode(sale.paymentMode);
    setQuantity(String(sale.quantity));
    setUnitPrice(String(sale.baseUnitPrice ?? sale.unitPrice));
    setReceivedAmount(String(sale.receivedAmount));
    setBatchDate(sale.batchDate ?? todayLocalISO());
    setBatchShift((sale.batchShift as Shift | null) ?? "AM");
    setRouteName(sale.routeName ?? "");
    setCollectionPoint(sale.collectionPoint ?? "");
    setFatPercent(sale.fatPercent != null ? String(sale.fatPercent) : "");
    setSnfPercent(sale.snfPercent != null ? String(sale.snfPercent) : "");
    setFatRatePerKg(sale.fatRatePerKg != null ? String(sale.fatRatePerKg) : "");
    setSnfRatePerKg(sale.snfRatePerKg != null ? String(sale.snfRatePerKg) : "");
    setSettlementCycle((sale.settlementCycle as SettlementCycle | null) ?? "MONTHLY");
    setOverrideWithdrawalLock(false);
    setOverrideReason("");
    setNotes(sale.notes ?? "");
  };

  const updateDeliveryStatus = async (
    row: DeliveryChecklistItemResponse,
    delivered: boolean,
    options?: { deliveryNote?: string | null; collectedAmountText?: string }
  ) => {
    if (!canDeliveryChecklist) {
      return;
    }
    const collectedRaw = options?.collectedAmountText?.trim() ?? "";
    let parsedCollectedAmount: number | null = null;
    if (collectedRaw) {
      const value = Number(collectedRaw);
      if (!Number.isFinite(value) || value <= 0) {
        Alert.alert(
          x("Invalid amount", "गलत राशि"),
          x("Collected amount must be a positive number.", "कलेक्ट की गई राशि पॉजिटिव होनी चाहिए।")
        );
        return;
      }
      parsedCollectedAmount = value;
    }

    try {
      setDeliverySavingSaleId(row.saleId);
      await SalesApi.updateDelivery(row.saleId, {
        delivered,
        deliveryNote: options?.deliveryNote ?? null,
        collectedAmount: parsedCollectedAmount,
      });
      setDeliveryCollectedBySaleId((prev) => ({ ...prev, [row.saleId]: "" }));
      await loadDelivery();
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not update delivery status.", "डिलीवरी स्टेटस अपडेट नहीं हुआ।")
      );
    } finally {
      setDeliverySavingSaleId(null);
    }
  };

  const updateReconciliation = async (saleId: string, reconciled: boolean) => {
    if (!canManageSales) {
      return;
    }
    try {
      setReconcilingSaleId(saleId);
      await SalesApi.reconcile(saleId, { reconciled });
      await loadSales();
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not update reconciliation status.", "रिकन्सिलिएशन स्टेटस अपडेट नहीं हुआ।")
      );
    } finally {
      setReconcilingSaleId(null);
    }
  };

  const renderDeliveryChecklist = () => (
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
        {x("Delivery Checklist", "डिलीवरी चेकलिस्ट")}
      </Text>
      <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
        {x("Tick delivered customers for selected date.", "चुनी हुई तारीख के लिए डिलीवर हुए ग्राहकों पर टिक करें।")}
      </Text>

      <TextInput
        value={dispatchDate}
        onChangeText={setDispatchDate}
        placeholder={x("Dispatch Date (YYYY-MM-DD)", "डिस्पैच तारीख (YYYY-MM-DD)")}
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

      {deliveryItems.length === 0 ? (
        <Text style={{ marginTop: 10, color: DairyColors.textSecondary }}>
          {deliveryLoading
            ? x("Loading checklist...", "चेकलिस्ट लोड हो रही है...")
            : x("No deliveries found for selected date.", "चुनी हुई तारीख के लिए कोई डिलीवरी नहीं मिली।")}
        </Text>
      ) : (
        deliveryItems.map((row) => (
          <View
            key={row.saleId}
            style={{
              marginTop: 8,
              borderWidth: 1,
              borderColor: row.delivered ? DairyColors.success : DairyColors.border,
              borderRadius: 10,
              padding: 10,
              backgroundColor: row.delivered ? DairyColors.successSoft : DairyColors.surfaceMuted,
            }}
          >
            <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
              {row.customerName}
            </Text>
            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
              {productTypeLabel(row.productType)} | {row.quantity.toFixed(2)}
              {row.routeName ? ` | ${row.routeName}` : ""}
            </Text>
            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
              {x(
                `Total ${amount(row.totalAmount)} | Received ${amount(row.receivedAmount)} | Pending ${amount(row.pendingAmount)}`,
                `कुल ${amount(row.totalAmount)} | मिला ${amount(row.receivedAmount)} | बाकी ${amount(row.pendingAmount)}`
              )}
            </Text>
            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
              {row.delivered
                ? x(
                    `Delivered by ${row.deliveredBy ?? "-"}${row.deliveredAt ? ` at ${row.deliveredAt}` : ""}`,
                    `${row.deliveredBy ?? "-"} द्वारा डिलीवर${row.deliveredAt ? ` (${row.deliveredAt})` : ""}`
                  )
                : x("Pending delivery", "डिलीवरी बाकी")}
            </Text>
            <TextInput
              value={deliveryCollectedBySaleId[row.saleId] ?? ""}
              onChangeText={(v) =>
                setDeliveryCollectedBySaleId((prev) => ({
                  ...prev,
                  [row.saleId]: v,
                }))
              }
              placeholder={x("Collected amount (optional)", "कलेक्ट राशि (वैकल्पिक)")}
              placeholderTextColor="#99A99A"
              keyboardType="decimal-pad"
              style={{
                marginTop: 8,
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 10,
                padding: 10,
                color: DairyColors.textPrimary,
                backgroundColor: DairyColors.surface,
              }}
            />
            <Pressable
              disabled={deliverySavingSaleId === row.saleId}
              onPress={() =>
                updateDeliveryStatus(row, !row.delivered, {
                  collectedAmountText: deliveryCollectedBySaleId[row.saleId] ?? "",
                })
              }
              style={{
                marginTop: 8,
                alignSelf: "flex-start",
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
                backgroundColor:
                  deliverySavingSaleId === row.saleId
                    ? DairyColors.textSecondary
                    : row.delivered
                      ? DairyColors.warning
                      : DairyColors.success,
              }}
            >
              <Text style={{ color: "white", fontWeight: "800" }}>
                {deliverySavingSaleId === row.saleId
                  ? x("Saving...", "सेव हो रहा है...")
                  : row.delivered
                    ? x("Mark Pending", "पेंडिंग करें")
                    : x("Mark Delivered", "डिलीवर मार्क करें")}
              </Text>
            </Pressable>
          </View>
        ))
      )}
    </View>
  );

  if (isDeliveryOnly) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: DairyColors.background }}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
              {x("Delivery", "डिलीवरी")}
            </Text>
            <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
              {x("Customer dispatch checklist", "ग्राहक डिस्पैच चेकलिस्ट")}
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
            <Ionicons
              name={deliveryLoading ? "sync-circle" : "refresh"}
              size={20}
              color={DairyColors.primary}
            />
          </Pressable>
        </View>
        {renderDeliveryChecklist()}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: DairyColors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
            {x("Sales", "बिक्री")}
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x("Dispatch and payment tracking", "डिस्पैच और भुगतान ट्रैकिंग")}
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
          <Ionicons
            name={loading || deliveryLoading ? "sync-circle" : "refresh"}
            size={20}
            color={DairyColors.primary}
          />
        </Pressable>
      </View>

      {canManageSales ? (
        <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 140, backgroundColor: DairyColors.accentSoft, borderRadius: 12, padding: 10 }}>
          <Text style={{ color: DairyColors.textSecondary }}>{x("Revenue", "कुल आय")}</Text>
          <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>{amount(summary?.totalRevenue ?? 0)}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 140, backgroundColor: DairyColors.successSoft, borderRadius: 12, padding: 10 }}>
          <Text style={{ color: DairyColors.textSecondary }}>{x("Received", "मिला भुगतान")}</Text>
          <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>{amount(summary?.totalReceived ?? 0)}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 140, backgroundColor: DairyColors.warningSoft, borderRadius: 12, padding: 10 }}>
          <Text style={{ color: DairyColors.textSecondary }}>{x("Pending", "बाकी")}</Text>
          <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>{amount(summary?.totalPending ?? 0)}</Text>
        </View>
        </View>
      ) : null}

      {!canManageSales && !canDeliveryChecklist ? (
        <ReadOnlyBanner
          subtitle={x("Sales module is restricted for this role.", "इस रोल के लिए बिक्री मॉड्यूल उपलब्ध नहीं है।")}
        />
      ) : null}

      {canDeliveryChecklist ? renderDeliveryChecklist() : null}

      {canManageSales ? (
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
          {editingSaleId ? x("Edit Sale", "बिक्री बदलें") : x("Create Sale", "बिक्री जोड़ें")}
        </Text>

        <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
          {x("Dispatch Date", "डिस्पैच तारीख")}
        </Text>
        <TextInput
          value={dispatchDate}
          onChangeText={setDispatchDate}
          placeholder={x("YYYY-MM-DD", "YYYY-MM-DD")}
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

        <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
          {x("Customer (daily subscriptions pre-listed)", "ग्राहक (दैनिक ग्राहक पहले से सूची में)")}
        </Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          {(customerRecords.length > 0 ? customerRecords.slice(0, 10) : []).map((row) => (
            <Pressable
              key={row.customerId}
              onPress={() => {
                setCustomerId(row.customerId);
                setCustomerName(row.customerName);
                applyCustomerDefaults(row);
              }}
              style={{
                borderWidth: 1,
                borderColor: customerId === row.customerId ? DairyColors.primary : DairyColors.border,
                backgroundColor: customerId === row.customerId ? DairyColors.primarySoft : DairyColors.surface,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{row.customerName}</Text>
            </Pressable>
          ))}
          {customerRecords.length === 0
            ? customers.slice(0, 10).map((name) => (
                <Pressable
                  key={name}
                  onPress={() => {
                    setCustomerId(null);
                    setCustomerName(name);
                    applyCustomerDefaults(findCustomerRecordByName(name));
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: customerName === name ? DairyColors.primary : DairyColors.border,
                    backgroundColor: customerName === name ? DairyColors.primarySoft : DairyColors.surface,
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{name}</Text>
                </Pressable>
              ))
            : null}
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <TextInput
            value={newCustomerName}
            onChangeText={setNewCustomerName}
            placeholder={x("Add new customer", "नया ग्राहक जोड़ें")}
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
          <Pressable
            onPress={() => void addNewCustomer()}
            style={{
              backgroundColor: DairyColors.primary,
              borderRadius: 10,
              paddingHorizontal: 12,
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "white", fontWeight: "800" }}>{x("Add", "जोड़ें")}</Text>
          </Pressable>
        </View>

        <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
          {x(`Selected: ${customerName || "None"}`, `चुना गया: ${customerName || "कोई नहीं"}`)}
        </Text>
        {(() => {
          const selectedCustomer = findCustomerRecordByName(customerName);
          if (!selectedCustomer) return null;
          return (
            <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
              {label("customerType", selectedCustomer.customerType)}
              {selectedCustomer.subscriptionActive
                ? x(
                    ` | ${(selectedCustomer.subscriptionFrequency ?? "DAILY") === "WEEKLY" ? "Weekly" : "Daily"} subscription ${selectedCustomer.dailySubscriptionQty ?? 0} L`,
                    ` | ${(selectedCustomer.subscriptionFrequency ?? "DAILY") === "WEEKLY" ? "साप्ताहिक" : "दैनिक"} सब्सक्रिप्शन ${selectedCustomer.dailySubscriptionQty ?? 0} L`
                  )
                : ""}
              {x(
                ` | Balance Rs ${(selectedCustomer.runningBalance ?? 0).toFixed(2)}`,
                ` | बकाया Rs ${(selectedCustomer.runningBalance ?? 0).toFixed(2)}`
              )}
              {selectedCustomer.routeName ? ` | ${selectedCustomer.routeName}` : ""}
            </Text>
          );
        })()}

        <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
          {x("Customer Type", "ग्राहक प्रकार")}
        </Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
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
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{customerTypeLabel(option)}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
          {x("Product", "उत्पाद")}
        </Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          {PRODUCT_TYPES.map((option) => (
            <Pressable
              key={option}
              onPress={() => setProductType(option)}
              style={{
                borderWidth: 1,
                borderColor: productType === option ? DairyColors.primary : DairyColors.border,
                backgroundColor: productType === option ? DairyColors.primarySoft : DairyColors.surface,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{productTypeLabel(option)}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <TextInput
            value={quantity}
            onChangeText={setQuantity}
            placeholder={x("Quantity", "मात्रा")}
            placeholderTextColor="#99A99A"
            keyboardType="decimal-pad"
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
            value={unitPrice}
            onChangeText={setUnitPrice}
            placeholder={x("Unit Price", "यूनिट कीमत")}
            placeholderTextColor="#99A99A"
            keyboardType="decimal-pad"
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

        <TextInput
          value={receivedAmount}
          onChangeText={setReceivedAmount}
          placeholder={x("Received Amount", "मिला भुगतान")}
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

        <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
          {x("Payment Mode", "भुगतान तरीका")}
        </Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          {PAYMENT_MODES.map((option) => (
            <Pressable
              key={option}
              onPress={() => setPaymentMode(option)}
              style={{
                borderWidth: 1,
                borderColor: paymentMode === option ? DairyColors.primary : DairyColors.border,
                backgroundColor: paymentMode === option ? DairyColors.primarySoft : DairyColors.surface,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{label("paymentMode", option)}</Text>
            </Pressable>
          ))}
        </View>

        {productType === "MILK" ? (
          <>
            <TextInput
              value={batchDate}
              onChangeText={setBatchDate}
              placeholder={x("Batch date (YYYY-MM-DD)", "बैच तारीख (YYYY-MM-DD)")}
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
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              {(["AM", "PM"] as Shift[]).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setBatchShift(s)}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: batchShift === s ? DairyColors.primary : DairyColors.border,
                    backgroundColor: batchShift === s ? DairyColors.primarySoft : DairyColors.surface,
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                    {label("shift", s)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View
              style={{
                marginTop: 8,
                borderRadius: 10,
                backgroundColor: DairyColors.infoSoft,
                padding: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Ionicons name="shield-checkmark" size={16} color={DairyColors.info} />
              <Text style={{ color: DairyColors.info, flex: 1 }}>
                {x(
                  "Milk sale needs PASS QC batch and withdrawal compliance.",
                  "दूध बिक्री के लिए PASS QC बैच और withdrawal compliance जरूरी है।"
                )}
              </Text>
            </View>

            {isCooperativeMilk ? (
              <View
                style={{
                  marginTop: 8,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  backgroundColor: DairyColors.surfaceMuted,
                  padding: 10,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                  {x("Cooperative settlement", "कोऑपरेटिव सेटलमेंट")}
                </Text>
                <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                  {x(
                    "Add route and Fat/SNF rates to auto-calculate settlement price.",
                    "रूट और Fat/SNF rate भरने पर सेटलमेंट कीमत अपने आप निकलेगी।"
                  )}
                </Text>

                <TextInput
                  value={routeName}
                  onChangeText={setRouteName}
                  placeholder={x("Route name (required)", "रूट नाम (जरूरी)")}
                  placeholderTextColor="#99A99A"
                  style={{
                    marginTop: 8,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 10,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surface,
                  }}
                />

                <TextInput
                  value={collectionPoint}
                  onChangeText={setCollectionPoint}
                  placeholder={x("Collection point (optional)", "कलेक्शन पॉइंट (वैकल्पिक)")}
                  placeholderTextColor="#99A99A"
                  style={{
                    marginTop: 8,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 10,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surface,
                  }}
                />

                <Text style={{ marginTop: 8, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Payout Cycle", "भुगतान चक्र")}
                </Text>
                <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {SETTLEMENT_CYCLES.map((cycle) => (
                    <Pressable
                      key={cycle}
                      onPress={() => setSettlementCycle(cycle)}
                      style={{
                        borderWidth: 1,
                        borderColor: settlementCycle === cycle ? DairyColors.primary : DairyColors.border,
                        backgroundColor: settlementCycle === cycle ? DairyColors.primarySoft : DairyColors.surface,
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                      }}
                    >
                      <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                        {label("settlementCycle", cycle)}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <TextInput
                    value={fatPercent}
                    onChangeText={setFatPercent}
                    placeholder={x("Fat %", "Fat %")}
                    placeholderTextColor="#99A99A"
                    keyboardType="decimal-pad"
                    style={{
                      borderWidth: 1,
                      borderColor: DairyColors.border,
                      borderRadius: 10,
                      padding: 10,
                      color: DairyColors.textPrimary,
                      backgroundColor: DairyColors.surface,
                      flex: 1,
                    }}
                  />
                  <TextInput
                    value={snfPercent}
                    onChangeText={setSnfPercent}
                    placeholder={x("SNF %", "SNF %")}
                    placeholderTextColor="#99A99A"
                    keyboardType="decimal-pad"
                    style={{
                      borderWidth: 1,
                      borderColor: DairyColors.border,
                      borderRadius: 10,
                      padding: 10,
                      color: DairyColors.textPrimary,
                      backgroundColor: DairyColors.surface,
                      flex: 1,
                    }}
                  />
                </View>

                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <TextInput
                    value={fatRatePerKg}
                    onChangeText={setFatRatePerKg}
                    placeholder={x("Fat rate / kg", "Fat rate / kg")}
                    placeholderTextColor="#99A99A"
                    keyboardType="decimal-pad"
                    style={{
                      borderWidth: 1,
                      borderColor: DairyColors.border,
                      borderRadius: 10,
                      padding: 10,
                      color: DairyColors.textPrimary,
                      backgroundColor: DairyColors.surface,
                      flex: 1,
                    }}
                  />
                  <TextInput
                    value={snfRatePerKg}
                    onChangeText={setSnfRatePerKg}
                    placeholder={x("SNF rate / kg", "SNF rate / kg")}
                    placeholderTextColor="#99A99A"
                    keyboardType="decimal-pad"
                    style={{
                      borderWidth: 1,
                      borderColor: DairyColors.border,
                      borderRadius: 10,
                      padding: 10,
                      color: DairyColors.textPrimary,
                      backgroundColor: DairyColors.surface,
                      flex: 1,
                    }}
                  />
                </View>

                <View
                  style={{
                    marginTop: 8,
                    borderRadius: 10,
                    backgroundColor: DairyColors.accentSoft,
                    padding: 8,
                  }}
                >
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                    {qualitySettlementPreview
                      ? x(
                          `Settlement: ${amount(qualitySettlementPreview.total)} @ ${qualitySettlementPreview.unitPrice.toFixed(2)}/L`,
                          `सेटलमेंट: ${amount(qualitySettlementPreview.total)} @ ${qualitySettlementPreview.unitPrice.toFixed(2)}/L`
                        )
                      : x(
                          "Fill Fat/SNF fields to auto-calculate settlement.",
                          "सेटलमेंट ऑटो-कैल्क्युलेट करने के लिए Fat/SNF भरें।"
                        )}
                  </Text>
                </View>
              </View>
            ) : null}

            <Pressable
              onPress={() => setOverrideWithdrawalLock((prev) => !prev)}
              style={{
                marginTop: 8,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: overrideWithdrawalLock ? DairyColors.warning : DairyColors.border,
                backgroundColor: overrideWithdrawalLock
                  ? DairyColors.warningSoft
                  : DairyColors.surface,
                padding: 10,
              }}
            >
              <Text
                style={{
                  color: overrideWithdrawalLock ? DairyColors.warning : DairyColors.textPrimary,
                  fontWeight: "800",
                }}
              >
                {overrideWithdrawalLock
                  ? x(
                      "Withdrawal Override Enabled (ADMIN/MANAGER)",
                      "Withdrawal ओवरराइड चालू (ADMIN/MANAGER)"
                    )
                  : x(
                      "Need override? Tap to enable (ADMIN/MANAGER)",
                      "ओवरराइड चाहिए? चालू करने के लिए दबाएं (ADMIN/MANAGER)"
                    )}
              </Text>
            </Pressable>

            {overrideWithdrawalLock ? (
              <TextInput
                value={overrideReason}
                onChangeText={setOverrideReason}
                placeholder={x(
                  "Override reason (required)",
                  "ओवरराइड कारण (जरूरी)"
                )}
                placeholderTextColor="#99A99A"
                style={{
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: DairyColors.warning,
                  borderRadius: 10,
                  padding: 10,
                  color: DairyColors.textPrimary,
                  backgroundColor: DairyColors.surfaceMuted,
                }}
              />
            ) : null}
          </>
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

        <View
          style={{
            marginTop: 8,
            borderRadius: 10,
            backgroundColor: DairyColors.accentSoft,
            padding: 8,
          }}
        >
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
            {x(`Total preview: ${amount(totalPreviewDisplay)}`, `कुल राशि: ${amount(totalPreviewDisplay)}`)}
          </Text>
        </View>

        <Pressable
          disabled={saving}
          onPress={saveSale}
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
              : editingSaleId
                ? x("Update Sale", "बिक्री अपडेट करें")
                : x("Create Sale", "बिक्री जोड़ें")}
          </Text>
        </Pressable>

        {editingSaleId ? (
          <Pressable
            onPress={resetForm}
            style={{
              marginTop: 8,
              padding: 10,
              borderWidth: 1,
              borderColor: DairyColors.border,
              borderRadius: 10,
              alignItems: "center",
            }}
          >
            <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>{x("Cancel Edit", "बदलाव रद्द करें")}</Text>
          </Pressable>
        ) : null}
        </View>
      ) : null}

      {canManageSales ? (
      <>
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
          {x(`Customer Ledger (${dispatchDate})`, `ग्राहक हिसाब (${dispatchDate})`)}
        </Text>
        {ledgerRows.length === 0 ? (
          <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
            {canManageSales
              ? x("No ledger rows for selected date.", "चुनी हुई तारीख के लिए कोई हिसाब रिकॉर्ड नहीं है।")
              : x("Only ADMIN can view revenue ledger.", "राजस्व हिसाब सिर्फ ADMIN देख सकता है।")}
          </Text>
        ) : (
          ledgerRows.map((row) => (
            <View
              key={`${row.customerType}__${row.customerName}`}
              style={{
                marginTop: 8,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: DairyColors.border,
                padding: 10,
                backgroundColor: DairyColors.surfaceMuted,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                {row.customerName} ({customerTypeLabel(row.customerType)})
              </Text>
              <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                {x(
                  `Amount ${amount(row.totalAmount)} | Received ${amount(row.totalReceived)} | Pending ${amount(row.totalPending)}`,
                  `राशि ${amount(row.totalAmount)} | मिला ${amount(row.totalReceived)} | बाकी ${amount(row.totalPending)}`
                )}
              </Text>
            </View>
          ))
        )}
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
        <Text style={{ fontWeight: "800", color: DairyColors.textPrimary }}>
          {x("Settlement Reconciliation (last 30 days)", "सेटलमेंट रिकन्सिलिएशन (पिछले 30 दिन)")}
        </Text>
        {reconciliationRows.length === 0 ? (
          <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
            {x("No cooperative settlement rows found.", "कोऑपरेटिव सेटलमेंट रिकॉर्ड नहीं मिला।")}
          </Text>
        ) : (
          reconciliationRows.map((row) => (
            <View
              key={`${row.customerType}__${row.customerName}__${row.routeName ?? "-"}__${row.settlementCycle}`}
              style={{
                marginTop: 8,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: DairyColors.border,
                padding: 10,
                backgroundColor: DairyColors.surfaceMuted,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                {row.customerName} ({customerTypeLabel(row.customerType)}) | {label("settlementCycle", row.settlementCycle)}
              </Text>
              <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                {x(
                  `Total ${amount(row.totalAmount)} | Received ${amount(row.totalReceived)} | Pending ${amount(row.totalPending)}`,
                  `कुल ${amount(row.totalAmount)} | मिला ${amount(row.totalReceived)} | बाकी ${amount(row.totalPending)}`
                )}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x(
                  `Txns ${row.totalTransactions} | Reconciled ${row.reconciledTransactions} | Open ${row.unreconciledTransactions}`,
                  `ट्रांजेक्शन ${row.totalTransactions} | रिकन्साइल ${row.reconciledTransactions} | खुले ${row.unreconciledTransactions}`
                )}
              </Text>
              {row.routeName ? (
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x(`Route: ${row.routeName}`, `रूट: ${row.routeName}`)}
                  {row.collectionPoint ? ` | ${row.collectionPoint}` : ""}
                </Text>
              ) : null}
            </View>
          ))
        )}
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
        <Text style={{ fontWeight: "800", color: DairyColors.textPrimary }}>
          {x(
            "Withdrawal Override Audit (last 7 days)",
            "Withdrawal ओवरराइड ऑडिट (पिछले 7 दिन)"
          )}
        </Text>
        {overrideAudits.length === 0 ? (
          <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
            {x("No override actions logged.", "कोई ओवरराइड एंट्री नहीं मिली।")}
          </Text>
        ) : (
          overrideAudits.slice(0, 5).map((row) => (
            <View
              key={row.saleOverrideAuditId}
              style={{
                marginTop: 8,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: DairyColors.border,
                padding: 10,
                backgroundColor: DairyColors.warningSoft,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                {row.customerName} | {row.dispatchDate} {row.batchShift}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x(`By ${row.actorUsername}`, `किसने किया: ${row.actorUsername}`)}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x(`Reason: ${row.overrideReason}`, `कारण: ${row.overrideReason}`)}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x(
                  `Blocked animals: ${row.blockedAnimalTags || row.blockedAnimalIds}`,
                  `रुके हुए जानवर: ${row.blockedAnimalTags || row.blockedAnimalIds}`
                )}
              </Text>
            </View>
          ))
        )}
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
        <Text style={{ fontWeight: "800", color: DairyColors.textPrimary }}>
          {x(`Sales History (${dispatchDate})`, `बिक्री इतिहास (${dispatchDate})`)}
        </Text>
        {sales.length === 0 ? (
          <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
            {canManageSales
              ? loading
                ? x("Loading sales...", "बिक्री लोड हो रही है...")
                : x("No sales found for selected date.", "चुनी हुई तारीख के लिए कोई बिक्री नहीं मिली।")
              : x("Only ADMIN can view sales revenue records.", "बिक्री राजस्व रिकॉर्ड सिर्फ ADMIN देख सकता है।")}
          </Text>
        ) : (
          sales.map((item) => {
            const tone = paymentTone(item.paymentStatus);
            const isCooperativeMilkSale =
              item.customerType === "COOPERATIVE" && item.productType === "MILK";
            const isReconciled = Boolean(item.reconciled);
            const reconciliationTone = isReconciled
              ? { text: DairyColors.success, background: DairyColors.successSoft }
              : { text: DairyColors.warning, background: DairyColors.warningSoft };
            return (
              <View
                key={item.saleId}
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
                  {productTypeLabel(item.productType)} | {item.quantity.toFixed(2)} @ {item.unitPrice.toFixed(2)}
                </Text>
                <Text style={{ color: DairyColors.textSecondary, marginTop: 2 }}>
                  {customerTypeLabel(item.customerType)} | {item.customerName}
                </Text>
                <Text style={{ color: DairyColors.textSecondary, marginTop: 2 }}>
                  {x(
                    `Total ${amount(item.totalAmount)} | Pending ${amount(item.pendingAmount)}`,
                    `कुल ${amount(item.totalAmount)} | बाकी ${amount(item.pendingAmount)}`
                  )}
                </Text>
                {item.subscriptionChargeApplied ? (
                  <Text style={{ color: DairyColors.info, marginTop: 2, fontWeight: "700" }}>
                    {x(
                      `Subscription balance impact: ${amount(item.subscriptionBalanceImpact ?? 0)} | Customer balance: ${amount(item.customerBalanceAfterSale ?? 0)}`,
                      `सब्सक्रिप्शन बकाया असर: ${amount(item.subscriptionBalanceImpact ?? 0)} | ग्राहक बकाया: ${amount(item.customerBalanceAfterSale ?? 0)}`
                    )}
                  </Text>
                ) : null}

                <View
                  style={{
                    marginTop: 6,
                    alignSelf: "flex-start",
                    borderRadius: 999,
                    backgroundColor: tone.background,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                  }}
                >
                  <Text style={{ color: tone.text, fontWeight: "700" }}>
                    {label("paymentStatus", item.paymentStatus)}
                  </Text>
                </View>
                <Text style={{ marginTop: 6, color: DairyColors.textSecondary }}>
                  {x("Payment mode", "भुगतान तरीका")}: {label("paymentMode", item.paymentMode)}
                </Text>
                {item.routeName ? (
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                    {x(`Route: ${item.routeName}`, `रूट: ${item.routeName}`)}
                    {item.collectionPoint ? ` | ${item.collectionPoint}` : ""}
                  </Text>
                ) : null}
                {item.qualityPricingApplied ? (
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                    {x(
                      `Fat ${item.fatPercent ?? "-"}%, SNF ${item.snfPercent ?? "-"}%, base ${item.baseUnitPrice?.toFixed(2) ?? "-"} -> final ${item.unitPrice.toFixed(2)}`,
                      `Fat ${item.fatPercent ?? "-"}%, SNF ${item.snfPercent ?? "-"}%, base ${item.baseUnitPrice?.toFixed(2) ?? "-"} -> final ${item.unitPrice.toFixed(2)}`
                    )}
                  </Text>
                ) : null}

                {isCooperativeMilkSale ? (
                  <>
                    <View
                      style={{
                        marginTop: 6,
                        alignSelf: "flex-start",
                        borderRadius: 999,
                        backgroundColor: reconciliationTone.background,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                      }}
                    >
                      <Text style={{ color: reconciliationTone.text, fontWeight: "700" }}>
                        {isReconciled
                          ? x("Reconciled", "रिकन्साइल्ड")
                          : x("Reconciliation Pending", "रिकन्सिलिएशन बाकी")}
                      </Text>
                    </View>
                    <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                      {x("Payout cycle", "भुगतान चक्र")}:{" "}
                      {label("settlementCycle", (item.settlementCycle as SettlementCycle | null) ?? "MONTHLY")}
                    </Text>
                    <Pressable
                      disabled={reconcilingSaleId === item.saleId}
                      onPress={() => updateReconciliation(item.saleId, !isReconciled)}
                      style={{
                        marginTop: 8,
                        borderWidth: 1,
                        borderColor: isReconciled ? DairyColors.warning : DairyColors.success,
                        borderRadius: 10,
                        alignSelf: "flex-start",
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        backgroundColor: isReconciled ? DairyColors.warningSoft : DairyColors.successSoft,
                      }}
                    >
                      <Text
                        style={{
                          color: isReconciled ? DairyColors.warning : DairyColors.success,
                          fontWeight: "700",
                        }}
                      >
                        {reconcilingSaleId === item.saleId
                          ? x("Updating...", "अपडेट हो रहा है...")
                          : isReconciled
                            ? x("Mark Unreconciled", "रिकन्साइल हटाएं")
                            : x("Mark Reconciled", "रिकन्साइल करें")}
                      </Text>
                    </Pressable>
                  </>
                ) : null}

                {canManageSales ? (
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
            );
          })
        )}
      </View>
      </>
      ) : null}
    </ScrollView>
  );
}
