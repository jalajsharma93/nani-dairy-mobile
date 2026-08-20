import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from "react-native";
import {
  CreateSalePayload,
  CustomerApi,
  DeliveryTaskApi,
  DeliveryTaskResponse,
  CustomerRecordResponse,
  CustomerSubscriptionInvoiceResponse,
  CustomerSubscriptionInvoiceSummaryResponse,
  CustomerSubscriptionStatementSummaryResponse,
  DeliveryChecklistItemResponse,
  CustomerLedgerRowResponse,
  CustomerType,
  MonthCloseSettlementBulkRequest,
  MonthCloseSettlementBulkResponse,
  PaymentMode,
  ProductType,
  SaleResponse,
  SaleOverrideAuditResponse,
  SettlementCycle,
  SettlementReconciliationRowResponse,
  SalesApi,
  SalesSummaryResponse,
  Shift,
  SubscriptionInvoiceStatusAuditResponse,
} from "@/src/services/api";
import { DairyColors } from "@/src/constants/dairy-theme";
import { DateInput } from "../../../components/date-input";
import { shiftIsoDate, todayLocalISO } from "@/src/utils/date";
import { useAuth } from "@/src/state/auth";
import { useI18n } from "@/src/state/i18n";
import { resolveRolePermissions } from "@/src/state/permissions";
import {
  getPendingSyncSummary,
  PendingSyncSummary,
  queueSaleReconcileUpdate,
  queueSaleSave,
  shouldQueueForOffline,
} from "@/src/utils/offline-sync";

const CUSTOMER_TYPES: CustomerType[] = ["COOPERATIVE", "RETAIL", "INDIVIDUAL"];
const PRODUCT_TYPES: ProductType[] = ["MILK", "GHEE", "CURD", "PANEER", "BUTTERMILK", "DUNG", "COMPOST"];
const PAYMENT_MODES: PaymentMode[] = ["CASH", "UPI", "BANK_TRANSFER", "CARD", "CREDIT"];
const SETTLEMENT_CYCLES: SettlementCycle[] = ["DAILY", "WEEKLY", "FORTNIGHTLY", "MONTHLY"];
const DEFAULT_CUSTOMERS = [
  "Daily Subscription - Route A",
  "Daily Subscription - Route B",
  "Shree Milk Cooperative",
];
const ISO_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const amount = (value: number) => `Rs ${value.toFixed(2)}`;
type SalesListFilter = "ALL" | "RECEIVED" | "PENDING";

function paymentTone(status: SaleResponse["paymentStatus"]) {
  if (status === "PAID") {
    return { text: DairyColors.success, background: DairyColors.successSoft };
  }
  if (status === "PARTIAL") {
    return { text: DairyColors.warning, background: DairyColors.warningSoft };
  }
  return { text: DairyColors.danger, background: DairyColors.dangerSoft };
}

function invoiceStatusTone(status: "DRAFT" | "FINALIZED" | "POSTED") {
  if (status === "POSTED") {
    return { text: DairyColors.success, background: DairyColors.successSoft };
  }
  if (status === "FINALIZED") {
    return { text: DairyColors.info, background: DairyColors.infoSoft };
  }
  return { text: DairyColors.warning, background: DairyColors.warningSoft };
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthRange(monthIso: string): { from: string; to: string } | null {
  if (!ISO_MONTH_REGEX.test(monthIso)) {
    return null;
  }
  const [yearText, monthText] = monthIso.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const from = new Date(year, monthIndex, 1);
  const now = new Date();
  const to =
    year === now.getFullYear() && monthIndex === now.getMonth()
      ? new Date(year, monthIndex, now.getDate())
      : new Date(year, monthIndex + 1, 0);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

export default function SalesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { x, label } = useI18n();
  const permissions = resolveRolePermissions(user?.role);
  const canManageSales = permissions.canManageSales;
  const isAdmin = permissions.isAdmin;
  const canDeliveryChecklist = permissions.canDeliveryChecklist;
  const isDeliveryOnly = canDeliveryChecklist && !canManageSales;

  const [sales, setSales] = useState<SaleResponse[]>([]);
  const [listFilter, setListFilter] = useState<SalesListFilter>("ALL");
  const [deliveryItems, setDeliveryItems] = useState<DeliveryChecklistItemResponse[]>([]);
  const [deliveryTasks, setDeliveryTasks] = useState<DeliveryTaskResponse[]>([]);
  const [customerRecords, setCustomerRecords] = useState<CustomerRecordResponse[]>([]);
  const [summary, setSummary] = useState<SalesSummaryResponse | null>(null);
  const [ledgerRows, setLedgerRows] = useState<CustomerLedgerRowResponse[]>([]);
  const [reconciliationRows, setReconciliationRows] = useState<SettlementReconciliationRowResponse[]>([]);
  const [overrideAudits, setOverrideAudits] = useState<SaleOverrideAuditResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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
  const [statementMonth, setStatementMonth] = useState(todayLocalISO().slice(0, 7));
  const [statementRows, setStatementRows] = useState<CustomerLedgerRowResponse[]>([]);
  const [statementReconciliationRows, setStatementReconciliationRows] = useState<
    SettlementReconciliationRowResponse[]
  >([]);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementPayoutByCustomer, setStatementPayoutByCustomer] = useState<Record<string, string>>({});
  const [statementClosingKey, setStatementClosingKey] = useState<string | null>(null);
  const [statementBulkClosing, setStatementBulkClosing] = useState(false);
  const [statementBulkPreviewing, setStatementBulkPreviewing] = useState(false);
  const [statementBulkPreviewResult, setStatementBulkPreviewResult] = useState<MonthCloseSettlementBulkResponse | null>(
    null
  );
  const [subscriptionInvoiceCustomerId, setSubscriptionInvoiceCustomerId] = useState<string>("");
  const [subscriptionInvoiceIncludeDaily, setSubscriptionInvoiceIncludeDaily] = useState(false);
  const [subscriptionInvoiceLoading, setSubscriptionInvoiceLoading] = useState(false);
  const [subscriptionInvoiceUpdatingStatus, setSubscriptionInvoiceUpdatingStatus] = useState(false);
  const [subscriptionInvoiceReopenReason, setSubscriptionInvoiceReopenReason] = useState("");
  const [subscriptionInvoice, setSubscriptionInvoice] = useState<CustomerSubscriptionInvoiceResponse | null>(null);
  const [saleFormInvoiceLock, setSaleFormInvoiceLock] = useState<CustomerSubscriptionInvoiceSummaryResponse | null>(null);
  const [saleFormInvoiceLockLoading, setSaleFormInvoiceLockLoading] = useState(false);
  const [saleFormInvoiceOverrideEnabled, setSaleFormInvoiceOverrideEnabled] = useState(false);
  const [saleFormInvoiceOverrideReason, setSaleFormInvoiceOverrideReason] = useState("");
  const [subscriptionInvoiceSummaries, setSubscriptionInvoiceSummaries] = useState<
    CustomerSubscriptionInvoiceSummaryResponse[]
  >([]);
  const [subscriptionStatementSummaries, setSubscriptionStatementSummaries] = useState<
    CustomerSubscriptionStatementSummaryResponse[]
  >([]);
  const [subscriptionInvoiceSummariesLoading, setSubscriptionInvoiceSummariesLoading] = useState(false);
  const [subscriptionStatementExporting, setSubscriptionStatementExporting] = useState(false);
  const [subscriptionInvoiceExporting, setSubscriptionInvoiceExporting] = useState(false);
  const [subscriptionInvoiceAuditsLoading, setSubscriptionInvoiceAuditsLoading] = useState(false);
  const [subscriptionInvoiceStatusAudits, setSubscriptionInvoiceStatusAudits] = useState<
    SubscriptionInvoiceStatusAuditResponse[]
  >([]);
  const [monthSubscriptionInvoiceAudits, setMonthSubscriptionInvoiceAudits] = useState<
    SubscriptionInvoiceStatusAuditResponse[]
  >([]);
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

  const customerTypeLabel = (type: CustomerType) => label("customerType", type);
  const productTypeLabel = (type: ProductType) => label("productType", type);
  const statementRange = useMemo(() => monthRange(statementMonth), [statementMonth]);
  const statementKey = useCallback((type: CustomerType, name: string) => `${type}::${name}`, []);
  const subscriptionCustomers = useMemo(
    () => customerRecords.filter((row) => row.isActive && row.subscriptionActive),
    [customerRecords]
  );
  const filteredSales = useMemo(() => {
    if (listFilter === "RECEIVED") {
      return sales.filter((sale) => sale.receivedAmount > 0);
    }
    if (listFilter === "PENDING") {
      return sales.filter((sale) => sale.pendingAmount > 0);
    }
    return sales;
  }, [listFilter, sales]);

  const listFilterLabel = (filter: SalesListFilter) => {
    if (filter === "RECEIVED") return x("Received", "मिला भुगतान");
    if (filter === "PENDING") return x("Pending", "बाकी");
    return x("Revenue", "कुल आय");
  };
  const selectedSaleCustomer = useMemo(() => {
    if (customerId?.trim()) {
      return customerRecords.find((row) => row.customerId === customerId) ?? null;
    }
    if (!customerName.trim()) {
      return null;
    }
    return customerRecords.find((row) => row.customerName === customerName) ?? null;
  }, [customerId, customerName, customerRecords]);
  const saleFormLockedByInvoice = !!saleFormInvoiceLock && !saleFormInvoiceOverrideEnabled;
  const saleFormOverrideReasonRequired =
    !!saleFormInvoiceLock && saleFormInvoiceOverrideEnabled && !saleFormInvoiceOverrideReason.trim();
  const statementBulkPreviewSummary = useMemo(() => {
    if (!statementBulkPreviewResult) {
      return null;
    }
    const totals = (statementBulkPreviewResult.results ?? []).reduce(
      (acc, item) => {
        acc.reconciled += item.reconciledSales ?? 0;
        acc.payout += item.payoutRecorded ?? 0;
        if (!item.success && acc.failures.length < 5) {
          acc.failures.push({
            customerName: item.customerName ?? "UNKNOWN",
            message: item.message ?? "Failed",
          });
        }
        return acc;
      },
      { reconciled: 0, payout: 0, failures: [] as { customerName: string; message: string }[] }
    );
    return totals;
  }, [statementBulkPreviewResult]);

  const monthInvoiceExceptionSummary = useMemo(() => {
    const exceptionRows = monthSubscriptionInvoiceAudits.filter(
      (row) => row.exceptionOverride || !!row.overrideReason?.trim()
    );
    const approvedCount = exceptionRows.filter((row) => !!row.approvedBy?.trim()).length;
    return {
      totalTransitions: monthSubscriptionInvoiceAudits.length,
      exceptionRows,
      approvedCount,
      pendingCount: Math.max(exceptionRows.length - approvedCount, 0),
    };
  }, [monthSubscriptionInvoiceAudits]);

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

  const loadMonthStatement = useCallback(async () => {
    if (!canManageSales) {
      setStatementRows([]);
      setStatementReconciliationRows([]);
      setSubscriptionInvoiceSummaries([]);
      setSubscriptionStatementSummaries([]);
      setSubscriptionInvoice(null);
      setSubscriptionInvoiceStatusAudits([]);
      setMonthSubscriptionInvoiceAudits([]);
      setStatementBulkPreviewResult(null);
      return;
    }
    if (!statementRange) {
      setStatementRows([]);
      setStatementReconciliationRows([]);
      setSubscriptionInvoiceSummaries([]);
      setSubscriptionStatementSummaries([]);
      setSubscriptionInvoice(null);
      setSubscriptionInvoiceStatusAudits([]);
      setMonthSubscriptionInvoiceAudits([]);
      setStatementBulkPreviewResult(null);
      return;
    }
    try {
      setStatementLoading(true);
      setSubscriptionInvoiceSummariesLoading(true);
      const [ledger, reconciliation, invoiceSummaries, statementSummaries, invoiceAudits] = await Promise.all([
        SalesApi.ledger(statementRange.from, statementRange.to),
        SalesApi.reconciliation(statementRange.from, statementRange.to),
        SalesApi.subscriptionInvoices({ month: statementMonth.trim() }),
        SalesApi.subscriptionStatements({ month: statementMonth.trim() }),
        SalesApi.subscriptionInvoiceAudits({ month: statementMonth.trim() }),
      ]);
      setStatementRows(ledger);
      setStatementReconciliationRows(reconciliation);
      setSubscriptionInvoiceSummaries(invoiceSummaries);
      setSubscriptionStatementSummaries(statementSummaries);
      setMonthSubscriptionInvoiceAudits(invoiceAudits);
      setStatementBulkPreviewResult(null);
      setStatementPayoutByCustomer((prev) => {
        const next = { ...prev };
        ledger.forEach((row) => {
          const key = statementKey(row.customerType, row.customerName);
          if (next[key] === undefined) {
            next[key] = row.totalPending > 0 ? row.totalPending.toFixed(2) : "";
          }
        });
        return next;
      });
    } catch (e: any) {
      console.error(e);
      setMonthSubscriptionInvoiceAudits([]);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load month-end statement.", "महीने का स्टेटमेंट लोड नहीं हुआ।")
      );
    } finally {
      setStatementLoading(false);
      setSubscriptionInvoiceSummariesLoading(false);
    }
  }, [canManageSales, statementMonth, statementRange, statementKey, x]);

  const downloadCsvContent = useCallback(
    async (csv: string, fileName: string) => {
      if (Platform.OS === "web" && typeof document !== "undefined") {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }
      await Share.share({
        title: fileName,
        message: csv,
      });
    },
    []
  );

  const exportSubscriptionStatementsCsv = useCallback(async () => {
    if (!canManageSales) {
      return;
    }
    const monthText = statementMonth.trim();
    if (!ISO_MONTH_REGEX.test(monthText)) {
      Alert.alert(
        x("Invalid month", "गलत महीना"),
        x("Use month format YYYY-MM.", "महीना YYYY-MM फॉर्मेट में डालें।")
      );
      return;
    }

    try {
      setSubscriptionStatementExporting(true);
      const csv = await SalesApi.exportSubscriptionStatementsCsv({ month: monthText });
      const fileName = `subscription-statements-${monthText}.csv`;
      await downloadCsvContent(csv, fileName);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Export failed", "एक्सपोर्ट नहीं हुआ"),
        e?.message ?? x("Could not export subscription statement CSV.", "सब्सक्रिप्शन स्टेटमेंट CSV एक्सपोर्ट नहीं हुआ।")
      );
    } finally {
      setSubscriptionStatementExporting(false);
    }
  }, [canManageSales, downloadCsvContent, statementMonth, x]);

  const exportSubscriptionInvoicesCsv = useCallback(async () => {
    if (!canManageSales) {
      return;
    }
    const monthText = statementMonth.trim();
    if (!ISO_MONTH_REGEX.test(monthText)) {
      Alert.alert(
        x("Invalid month", "गलत महीना"),
        x("Use month format YYYY-MM.", "महीना YYYY-MM फॉर्मेट में डालें।")
      );
      return;
    }

    try {
      setSubscriptionInvoiceExporting(true);
      const csv = await SalesApi.exportSubscriptionInvoicesCsv({ month: monthText });
      const fileName = `subscription-invoices-${monthText}.csv`;
      await downloadCsvContent(csv, fileName);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Export failed", "एक्सपोर्ट नहीं हुआ"),
        e?.message ?? x("Could not export subscription invoice CSV.", "सब्सक्रिप्शन इनवॉइस CSV एक्सपोर्ट नहीं हुआ।")
      );
    } finally {
      setSubscriptionInvoiceExporting(false);
    }
  }, [canManageSales, downloadCsvContent, statementMonth, x]);

  const loadSubscriptionInvoiceAudits = useCallback(
    async (customerIdToLoad: string) => {
      if (!canManageSales || !customerIdToLoad.trim() || !ISO_MONTH_REGEX.test(statementMonth.trim())) {
        setSubscriptionInvoiceStatusAudits([]);
        return;
      }
      try {
        setSubscriptionInvoiceAuditsLoading(true);
        const rows = await SalesApi.subscriptionInvoiceAudits({
          month: statementMonth.trim(),
          customerId: customerIdToLoad.trim(),
        });
        setSubscriptionInvoiceStatusAudits(rows);
      } catch (e: any) {
        console.error(e);
        setSubscriptionInvoiceStatusAudits([]);
      } finally {
        setSubscriptionInvoiceAuditsLoading(false);
      }
    },
    [canManageSales, statementMonth]
  );

  const loadSubscriptionInvoice = useCallback(async () => {
    if (!canManageSales) {
      setSubscriptionInvoice(null);
      setSubscriptionInvoiceStatusAudits([]);
      return;
    }
    const customerIdToLoad = subscriptionInvoiceCustomerId.trim();
    if (!customerIdToLoad) {
      Alert.alert(
        x("Select customer", "ग्राहक चुनें"),
        x("Select a subscription customer first.", "पहले एक सब्सक्रिप्शन ग्राहक चुनें।")
      );
      return;
    }
    if (!ISO_MONTH_REGEX.test(statementMonth.trim())) {
      Alert.alert(
        x("Invalid month", "गलत महीना"),
        x("Use month format YYYY-MM.", "महीना YYYY-MM फॉर्मेट में डालें।")
      );
      return;
    }
    try {
      setSubscriptionInvoiceLoading(true);
      const [invoice] = await Promise.all([
        SalesApi.subscriptionInvoice({
          customerId: customerIdToLoad,
          month: statementMonth.trim(),
          includeDaily: subscriptionInvoiceIncludeDaily,
        }),
        loadSubscriptionInvoiceAudits(customerIdToLoad),
      ]);
      setSubscriptionInvoice(invoice);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load subscription invoice.", "सब्सक्रिप्शन इनवॉइस लोड नहीं हुआ।")
      );
    } finally {
      setSubscriptionInvoiceLoading(false);
    }
  }, [
    canManageSales,
    loadSubscriptionInvoiceAudits,
    statementMonth,
    subscriptionInvoiceCustomerId,
    subscriptionInvoiceIncludeDaily,
    x,
  ]);

  const updateSubscriptionInvoiceStatus = useCallback(
    async (next: "FINALIZE" | "POST" | "REOPEN") => {
      if (!canManageSales) {
        Alert.alert(
          x("Role restricted", "रोल अनुमति नहीं"),
          x("Only ADMIN or MANAGER can update invoice lifecycle.", "इनवॉइस स्टेटस सिर्फ ADMIN या MANAGER अपडेट कर सकता है।")
        );
        return;
      }
      if (next === "REOPEN" && !isAdmin) {
        Alert.alert(
          x("Admin required", "एडमिन जरूरी"),
          x("Only ADMIN can reopen finalized/posted invoices.", "फाइनल या पोस्टेड इनवॉइस केवल ADMIN रीओपन कर सकता है।")
        );
        return;
      }
      const customerIdToLoad = subscriptionInvoiceCustomerId.trim();
      if (!customerIdToLoad) {
        Alert.alert(
          x("Select customer", "ग्राहक चुनें"),
          x("Select a subscription customer first.", "पहले एक सब्सक्रिप्शन ग्राहक चुनें।")
        );
        return;
      }
      if (!ISO_MONTH_REGEX.test(statementMonth.trim())) {
        Alert.alert(
          x("Invalid month", "गलत महीना"),
          x("Use month format YYYY-MM.", "महीना YYYY-MM फॉर्मेट में डालें।")
        );
        return;
      }
      if (next === "REOPEN" && !subscriptionInvoiceReopenReason.trim()) {
        Alert.alert(
          x("Reason required", "कारण जरूरी"),
          x("Provide override reason to reopen invoice.", "इनवॉइस रीओपन करने के लिए कारण भरें।")
        );
        return;
      }
      try {
        setSubscriptionInvoiceUpdatingStatus(true);
        const payload = {
          customerId: customerIdToLoad,
          month: statementMonth.trim(),
          note: null as string | null,
          overrideReason: null as string | null,
        };
        if (next === "REOPEN") {
          payload.overrideReason = subscriptionInvoiceReopenReason.trim();
          payload.note = x("Reopened by admin override", "एडमिन ओवरराइड से रीओपन");
          await SalesApi.reopenSubscriptionInvoice(payload);
          setSubscriptionInvoiceReopenReason("");
        } else if (next === "POST") {
          payload.note = x("Posted for month close", "महीना बंद करने के लिए पोस्ट किया गया");
          await SalesApi.postSubscriptionInvoice(payload);
        } else {
          payload.note = x("Finalized for review", "रिव्यू के लिए फाइनल किया गया");
          await SalesApi.finalizeSubscriptionInvoice(payload);
        }
        await Promise.all([loadSubscriptionInvoice(), loadMonthStatement()]);
      } catch (e: any) {
        console.error(e);
        Alert.alert(
          x("Update failed", "अपडेट नहीं हुआ"),
          e?.message ?? x("Could not update invoice status.", "इनवॉइस स्टेटस अपडेट नहीं हुआ।")
        );
      } finally {
        setSubscriptionInvoiceUpdatingStatus(false);
      }
    },
    [
      canManageSales,
      isAdmin,
      loadMonthStatement,
      loadSubscriptionInvoice,
      statementMonth,
      subscriptionInvoiceCustomerId,
      subscriptionInvoiceReopenReason,
      x,
    ]
  );

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
      setDeliveryTasks([]);
      return;
    }
    try {
      setDeliveryLoading(true);
      if (canManageSales) {
        await DeliveryTaskApi.generateSubscriptions(dispatchDate).catch((e) => {
          console.error(e);
        });
      }
      const [rows, taskRows] = await Promise.all([
        SalesApi.deliveryList(dispatchDate),
        DeliveryTaskApi.list({ date: dispatchDate }),
      ]);
      setDeliveryItems(rows);
      setDeliveryTasks(taskRows);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load delivery checklist.", "डिलीवरी लिस्ट लोड नहीं हो पाई।")
      );
    } finally {
      setDeliveryLoading(false);
    }
  }, [canDeliveryChecklist, canManageSales, dispatchDate, x]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  useEffect(() => {
    loadDelivery();
  }, [loadDelivery]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    void loadMonthStatement();
  }, [loadMonthStatement]);

  useEffect(() => {
    if (subscriptionCustomers.length === 0) {
      setSubscriptionInvoiceCustomerId("");
      return;
    }
    if (subscriptionInvoiceCustomerId && subscriptionCustomers.some((row) => row.customerId === subscriptionInvoiceCustomerId)) {
      return;
    }
    setSubscriptionInvoiceCustomerId(subscriptionCustomers[0].customerId);
  }, [subscriptionCustomers, subscriptionInvoiceCustomerId]);

  useEffect(() => {
    let cancelled = false;

    const loadSaleFormInvoiceLock = async () => {
      if (!canManageSales) {
        setSaleFormInvoiceLock(null);
        setSaleFormInvoiceLockLoading(false);
        return;
      }

      const month = dispatchDate.slice(0, 7);
      if (
        !selectedSaleCustomer?.customerId ||
        !selectedSaleCustomer.subscriptionActive ||
        !ISO_MONTH_REGEX.test(month)
      ) {
        setSaleFormInvoiceLock(null);
        setSaleFormInvoiceLockLoading(false);
        return;
      }

      try {
        setSaleFormInvoiceLockLoading(true);
        const rows = await SalesApi.subscriptionInvoices({ month });
        if (cancelled) {
          return;
        }
        const row = rows.find((entry) => entry.customerId === selectedSaleCustomer.customerId) ?? null;
        if (row && row.status !== "DRAFT") {
          setSaleFormInvoiceLock(row);
          return;
        }
        setSaleFormInvoiceLock(null);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setSaleFormInvoiceLock(null);
        }
      } finally {
        if (!cancelled) {
          setSaleFormInvoiceLockLoading(false);
        }
      }
    };

    void loadSaleFormInvoiceLock();
    return () => {
      cancelled = true;
    };
  }, [canManageSales, dispatchDate, selectedSaleCustomer?.customerId, selectedSaleCustomer?.subscriptionActive]);

  useEffect(() => {
    setSaleFormInvoiceOverrideEnabled(false);
    setSaleFormInvoiceOverrideReason("");
  }, [dispatchDate, customerId, customerName, editingSaleId]);

  const refreshAll = useCallback(() => {
    void loadSales();
    void loadDelivery();
    void loadCustomers();
    void loadMonthStatement();
    if (subscriptionInvoiceCustomerId.trim()) {
      void loadSubscriptionInvoice();
    }
  }, [loadCustomers, loadDelivery, loadMonthStatement, loadSales, loadSubscriptionInvoice, subscriptionInvoiceCustomerId]);

  const refreshPendingSync = useCallback(async () => {
    setPendingSync(await getPendingSyncSummary());
  }, []);

  const totalPreview = useMemo(() => {
    const q = Number(quantity);
    const up = Number(unitPrice);
    return Number.isFinite(q) && Number.isFinite(up) ? q * up : 0;
  }, [quantity, unitPrice]);

  useEffect(() => {
    void refreshPendingSync();
  }, [refreshPendingSync]);

  const salesPendingCount =
    pendingSync.saleSave +
    pendingSync.saleDeliveryUpdate +
    pendingSync.saleReconcileUpdate +
    pendingSync.deliveryTaskCreate +
    pendingSync.deliveryTaskStatus +
    pendingSync.deliveryAddOn;

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
  const saleSaveDisabled =
    saving || saleFormInvoiceLockLoading || saleFormLockedByInvoice || saleFormOverrideReasonRequired;
  const statementReconciliationByKey = useMemo(() => {
    const map = new Map<string, SettlementReconciliationRowResponse>();
    statementReconciliationRows.forEach((row) => {
      map.set(statementKey(row.customerType, row.customerName), row);
    });
    return map;
  }, [statementKey, statementReconciliationRows]);

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
      setSaleFormInvoiceLock(null);
      setSaleFormInvoiceLockLoading(true);
      setSaleFormInvoiceOverrideEnabled(false);
      setSaleFormInvoiceOverrideReason("");
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
    setSaleFormInvoiceLock(null);
    setSaleFormInvoiceLockLoading(false);
    setSaleFormInvoiceOverrideEnabled(false);
    setSaleFormInvoiceOverrideReason("");
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

    if (saleFormInvoiceLock && saleFormInvoiceOverrideEnabled && !saleFormInvoiceOverrideReason.trim()) {
      Alert.alert(
        x("Missing override reason", "ओवरराइड कारण अधूरा"),
        x(
          "Enter override reason to edit sale in finalized/posted invoice period.",
          "फाइनल/पोस्टेड इनवॉइस अवधि में बिक्री बदलने के लिए override reason दर्ज करें।"
        )
      );
      return null;
    }

    const noteParts: string[] = [];
    const baseNotes = notes.trim();
    if (baseNotes) {
      noteParts.push(baseNotes);
    }
    if (saleFormInvoiceLock && saleFormInvoiceOverrideEnabled) {
      noteParts.push(
        `Invoice override ${saleFormInvoiceLock.invoiceNumber} (${saleFormInvoiceLock.status}) reason: ${saleFormInvoiceOverrideReason.trim()}`
      );
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
      notes: noteParts.join(" | ") || null,
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

    if (saleFormInvoiceLockLoading) {
      Alert.alert(
        x("Please wait", "कृपया प्रतीक्षा करें"),
        x("Checking invoice lock status. Try again in a moment.", "इनवॉइस लॉक स्थिति जांची जा रही है। एक क्षण बाद फिर प्रयास करें।")
      );
      return;
    }

    if (saleFormLockedByInvoice) {
      Alert.alert(
        x("Invoice locked", "इनवॉइस लॉक"),
        x(
          `Invoice ${saleFormInvoiceLock?.invoiceNumber ?? ""} is ${saleFormInvoiceLock?.status}. Enable override to edit.`,
          `इनवॉइस ${saleFormInvoiceLock?.invoiceNumber ?? ""} ${saleFormInvoiceLock?.status} है। बदलाव के लिए ओवरराइड चालू करें।`
        )
      );
      return;
    }

    if (saleFormOverrideReasonRequired) {
      Alert.alert(
        x("Missing override reason", "ओवरराइड कारण अधूरा"),
        x(
          "Enter override reason before saving in finalized/posted invoice period.",
          "फाइनल/पोस्टेड इनवॉइस अवधि में सेव करने से पहले override reason दर्ज करें।"
        )
      );
      return;
    }

    const dispatchMonth = dispatchDate.slice(0, 7);
    if (selectedSaleCustomer?.customerId && selectedSaleCustomer.subscriptionActive && ISO_MONTH_REGEX.test(dispatchMonth)) {
      try {
        const monthInvoices = await SalesApi.subscriptionInvoices({ month: dispatchMonth });
        const matchingInvoice = monthInvoices.find((row) => row.customerId === selectedSaleCustomer.customerId) ?? null;
        if (matchingInvoice && matchingInvoice.status !== "DRAFT") {
          setSaleFormInvoiceLock(matchingInvoice);
          if (!saleFormInvoiceOverrideEnabled) {
            Alert.alert(
              x("Invoice locked", "इनवॉइस लॉक"),
              x(
                `Invoice ${matchingInvoice.invoiceNumber} is ${matchingInvoice.status}. Enable override to edit.`,
                `इनवॉइस ${matchingInvoice.invoiceNumber} ${matchingInvoice.status} है। बदलाव के लिए ओवरराइड चालू करें।`
              )
            );
            return;
          }
          if (!saleFormInvoiceOverrideReason.trim()) {
            Alert.alert(
              x("Missing override reason", "ओवरराइड कारण अधूरा"),
              x(
                "Enter override reason before saving in finalized/posted invoice period.",
                "फाइनल/पोस्टेड इनवॉइस अवधि में सेव करने से पहले override reason दर्ज करें।"
              )
            );
            return;
          }
        } else {
          setSaleFormInvoiceLock(null);
        }
      } catch (e) {
        console.error(e);
      }
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
      await Promise.all([loadSales(), loadCustomers(), loadMonthStatement()]);
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
      } else if (shouldQueueForOffline(e)) {
        await queueSaleSave(
          {
            saleId: editingSaleId,
            payload,
          },
          message
        );
        await refreshPendingSync();
        resetForm();
        Alert.alert(
          x("Saved Offline", "ऑफलाइन सेव"),
          x("Sale is queued and will sync automatically.", "बिक्री कतार में है और अपने-आप सिंक होगी।")
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

    setSaleFormInvoiceLock(null);
    setSaleFormInvoiceLockLoading(true);
    setSaleFormInvoiceOverrideEnabled(false);
    setSaleFormInvoiceOverrideReason("");
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

  const updateReconciliation = async (sale: SaleResponse, reconciled: boolean) => {
    if (!canManageSales) {
      Alert.alert(
        x("Role restricted", "रोल अनुमति नहीं"),
        x("Only ADMIN or MANAGER can update reconciliation.", "रिकन्सिलिएशन सिर्फ ADMIN या MANAGER अपडेट कर सकता है।")
      );
      return;
    }
    const saleId = sale.saleId;
    const payload = {
      reconciled,
      expectedUpdatedAt: sale.updatedAt ?? undefined,
    };
    try {
      setReconcilingSaleId(saleId);
      await SalesApi.reconcile(saleId, payload);
      await Promise.all([loadSales(), loadMonthStatement()]);
    } catch (e: any) {
      console.error(e);
      if (shouldQueueForOffline(e)) {
        await queueSaleReconcileUpdate(saleId, payload, String(e?.message ?? ""));
        await refreshPendingSync();
        Alert.alert(
          x("Saved Offline", "ऑफलाइन सेव"),
          x("Reconciliation update is queued and will sync automatically.", "रिकन्सिलिएशन अपडेट कतार में है और अपने-आप सिंक होगा।")
        );
        return;
      }
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not update reconciliation status.", "रिकन्सिलिएशन स्टेटस अपडेट नहीं हुआ।")
      );
    } finally {
      setReconcilingSaleId(null);
    }
  };

  const closeMonthSettlement = async (row: CustomerLedgerRowResponse) => {
    if (!canManageSales || !statementRange) {
      return;
    }
    const key = statementKey(row.customerType, row.customerName);
    const payoutRaw = (statementPayoutByCustomer[key] ?? row.totalPending.toFixed(2)).trim();
    const payoutAmount = payoutRaw ? Number(payoutRaw) : 0;
    const reconciliationRow = statementReconciliationRows.find(
      (item) => item.customerType === row.customerType && item.customerName === row.customerName
    );
    const openReconciliations = reconciliationRow?.unreconciledTransactions ?? 0;
    const shouldReconcile = row.customerType === "COOPERATIVE" && openReconciliations > 0;
    const shouldPayout = payoutAmount > 0;
    if (!shouldReconcile && !shouldPayout) {
      Alert.alert(
        x("Nothing to close", "बंद करने के लिए कुछ नहीं"),
        x(
          "Enter payout amount or pick a customer with pending cooperative reconciliations.",
          "पेआउट राशि भरें या ऐसा ग्राहक चुनें जिसमें कोऑपरेटिव रिकन्सिलिएशन बाकी हो।"
        )
      );
      return;
    }
    if (payoutRaw && (!Number.isFinite(payoutAmount) || payoutAmount < 0)) {
      Alert.alert(
        x("Invalid amount", "गलत राशि"),
        x("Payout amount must be zero or a positive number.", "पेआउट राशि 0 या पॉजिटिव होनी चाहिए।")
      );
      return;
    }
    const customer = customerRecords.find(
      (record) => record.customerType === row.customerType && record.customerName === row.customerName
    );
    if (shouldPayout && !customer) {
      Alert.alert(
        x("Customer not found", "ग्राहक नहीं मिला"),
        x(
          "Customer record is required to post payout.",
          "पेआउट पोस्ट करने के लिए ग्राहक रिकॉर्ड जरूरी है।"
        )
      );
      return;
    }

    const note = `Month close ${statementRange.from} to ${statementRange.to} | review checklist done`;
    try {
      setStatementClosingKey(key);
      const result = await SalesApi.monthClose({
        dateFrom: statementRange.from,
        dateTo: statementRange.to,
        customerType: row.customerType,
        customerId: customer?.customerId ?? null,
        customerName: row.customerName,
        payoutAmount: shouldPayout ? payoutAmount : 0,
        reconcileOpenCooperative: shouldReconcile,
        note,
      });
      await Promise.all([loadCustomers(), loadSales(), loadMonthStatement()]);
      Alert.alert(
        x("Settlement closed", "सेटलमेंट बंद"),
        x(
          `Payout ${amount(Math.max(0, result.payoutRecorded ?? 0))} recorded. Reconciled ${result.reconciledSales ?? 0} sale(s).`,
          `पेआउट ${amount(Math.max(0, result.payoutRecorded ?? 0))} दर्ज हुआ। ${result.reconciledSales ?? 0} बिक्री रिकन्साइल हुई।`
        )
      );
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Close failed", "बंद नहीं हुआ"),
        e?.message ?? x("Could not close month settlement.", "महीने का सेटलमेंट बंद नहीं हुआ।")
      );
    } finally {
      setStatementClosingKey(null);
    }
  };

  const buildMonthCloseBulkPayload = useCallback(() => {
    if (!statementRange) {
      return null;
    }
    const note = `Month close ${statementRange.from} to ${statementRange.to} | review checklist done`;
    const missingPayoutCustomers: string[] = [];
    const invalidPayoutCustomers: string[] = [];
    const items = statementRows
      .map((row) => {
        const key = statementKey(row.customerType, row.customerName);
        const recon = statementReconciliationByKey.get(key);
        const openReconciliations = recon?.unreconciledTransactions ?? 0;
        const shouldReconcile = row.customerType === "COOPERATIVE" && openReconciliations > 0;
        const payoutRaw = (statementPayoutByCustomer[key] ?? row.totalPending.toFixed(2)).trim();
        const payoutAmount = payoutRaw ? Number(payoutRaw) : 0;
        const hasInvalidPayout = payoutRaw.length > 0 && (!Number.isFinite(payoutAmount) || payoutAmount < 0);
        if (hasInvalidPayout) {
          invalidPayoutCustomers.push(row.customerName);
        }
        const shouldPayout = !hasInvalidPayout && payoutAmount > 0;
        const customer = customerRecords.find(
          (record) => record.customerType === row.customerType && record.customerName === row.customerName
        );
        if (shouldPayout && !customer) {
          missingPayoutCustomers.push(row.customerName);
        }
        return {
          customerType: row.customerType,
          customerId: customer?.customerId ?? null,
          customerName: row.customerName,
          payoutAmount: shouldPayout ? payoutAmount : 0,
          reconcileOpenCooperative: shouldReconcile,
          actionable: shouldReconcile || shouldPayout,
        };
      })
      .filter((item) => item.actionable)
      .map((item) => ({
        customerType: item.customerType,
        customerId: item.customerId,
        customerName: item.customerName,
        payoutAmount: item.payoutAmount,
        reconcileOpenCooperative: item.reconcileOpenCooperative,
      }));
    const payload: MonthCloseSettlementBulkRequest = {
      dateFrom: statementRange.from,
      dateTo: statementRange.to,
      note,
      items,
    };
    return { payload, missingPayoutCustomers, invalidPayoutCustomers };
  }, [
    customerRecords,
    statementKey,
    statementPayoutByCustomer,
    statementRange,
    statementReconciliationByKey,
    statementRows,
  ]);

  const closeMonthSettlementBulk = async () => {
    if (!canManageSales) {
      return;
    }
    const builtPayload = buildMonthCloseBulkPayload();
    if (!builtPayload) {
      return;
    }
    const { payload, missingPayoutCustomers, invalidPayoutCustomers } = builtPayload;
    const previewMatchesCurrentPayload =
      statementBulkPreviewResult?.dateFrom === payload.dateFrom &&
      statementBulkPreviewResult?.dateTo === payload.dateTo &&
      statementBulkPreviewResult?.requestedCount === payload.items.length;

    if (invalidPayoutCustomers.length > 0) {
      Alert.alert(
        x("Invalid amount", "गलत राशि"),
        x(
          `Fix payout amount for: ${invalidPayoutCustomers.join(", ")}`,
          `इन ग्राहकों के लिए पेआउट राशि ठीक करें: ${invalidPayoutCustomers.join(", ")}`
        )
      );
      return;
    }
    if (missingPayoutCustomers.length > 0) {
      Alert.alert(
        x("Customer record missing", "ग्राहक रिकॉर्ड नहीं मिला"),
        x(
          `Cannot record payout for: ${missingPayoutCustomers.join(", ")}`,
          `इनके लिए पेआउट रिकॉर्ड नहीं हो सकता: ${missingPayoutCustomers.join(", ")}`
        )
      );
      return;
    }
    if (payload.items.length === 0) {
      Alert.alert(
        x("Nothing to close", "बंद करने के लिए कुछ नहीं"),
        x(
          "No payout or cooperative reconciliation pending for this month.",
          "इस महीने के लिए न पेआउट बाकी है न कोऑपरेटिव रिकन्सिलिएशन।"
        )
      );
      return;
    }
    const confirmed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        x("Confirm close", "क्लोज़ की पुष्टि"),
        previewMatchesCurrentPayload
          ? x(
              `Close ${payload.items.length} rows now? Preview failed ${statementBulkPreviewResult?.failedCount ?? 0} row(s).`,
              `क्या अभी ${payload.items.length} पंक्तियां बंद करें? प्रीव्यू में ${statementBulkPreviewResult?.failedCount ?? 0} पंक्तियां असफल हैं।`
            )
          : x(
              `Close ${payload.items.length} rows now without fresh preview?`,
              `क्या ${payload.items.length} पंक्तियां बिना ताज़ा प्रीव्यू के बंद करें?`
            ),
        [
          {
            text: x("Cancel", "रद्द करें"),
            style: "cancel",
            onPress: () => resolve(false),
          },
          {
            text: x("Close now", "अभी बंद करें"),
            style: "destructive",
            onPress: () => resolve(true),
          },
        ],
        { cancelable: false }
      );
    });
    if (!confirmed) {
      return;
    }

    try {
      setStatementBulkClosing(true);
      const result = await SalesApi.monthCloseBulk(payload);
      await Promise.all([loadCustomers(), loadSales(), loadMonthStatement()]);
      setStatementBulkPreviewResult(null);
      const failedMessages = (result.results ?? [])
        .filter((item) => !item.success)
        .slice(0, 3)
        .map((item) => `${item.customerName ?? "UNKNOWN"}: ${item.message ?? "Failed"}`)
        .join("\n");
      Alert.alert(
        x("Bulk close completed", "बल्क क्लोज़ पूरा"),
        x(
          `Requested ${result.requestedCount}, Succeeded ${result.succeededCount}, Failed ${result.failedCount}${failedMessages ? `\n${failedMessages}` : ""}`,
          `कुल ${result.requestedCount}, सफल ${result.succeededCount}, असफल ${result.failedCount}${failedMessages ? `\n${failedMessages}` : ""}`
        )
      );
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Bulk close failed", "बल्क क्लोज़ असफल"),
        e?.message ?? x("Could not close month in bulk.", "महीने का बल्क क्लोज़ नहीं हुआ।")
      );
    } finally {
      setStatementBulkClosing(false);
    }
  };

  const previewMonthSettlementBulk = async () => {
    if (!canManageSales) {
      return;
    }
    const builtPayload = buildMonthCloseBulkPayload();
    if (!builtPayload) {
      return;
    }
    const { payload, missingPayoutCustomers, invalidPayoutCustomers } = builtPayload;

    if (invalidPayoutCustomers.length > 0) {
      Alert.alert(
        x("Invalid amount", "गलत राशि"),
        x(
          `Fix payout amount for: ${invalidPayoutCustomers.join(", ")}`,
          `इन ग्राहकों के लिए पेआउट राशि ठीक करें: ${invalidPayoutCustomers.join(", ")}`
        )
      );
      return;
    }
    if (missingPayoutCustomers.length > 0) {
      Alert.alert(
        x("Customer record missing", "ग्राहक रिकॉर्ड नहीं मिला"),
        x(
          `Cannot record payout for: ${missingPayoutCustomers.join(", ")}`,
          `इनके लिए पेआउट रिकॉर्ड नहीं हो सकता: ${missingPayoutCustomers.join(", ")}`
        )
      );
      return;
    }
    if (payload.items.length === 0) {
      Alert.alert(
        x("Nothing to preview", "प्रीव्यू के लिए कुछ नहीं"),
        x(
          "No payout or cooperative reconciliation pending for this month.",
          "इस महीने के लिए न पेआउट बाकी है न कोऑपरेटिव रिकन्सिलिएशन।"
        )
      );
      return;
    }

    try {
      setStatementBulkPreviewing(true);
      const result = await SalesApi.monthCloseBulkPreview(payload);
      setStatementBulkPreviewResult(result);
      const failedMessages = (result.results ?? [])
        .filter((item) => !item.success)
        .slice(0, 3)
        .map((item) => `${item.customerName ?? "UNKNOWN"}: ${item.message ?? "Failed"}`)
        .join("\n");
      const previewReconciliations = (result.results ?? []).reduce(
        (sum, item) => sum + (item.reconciledSales ?? 0),
        0
      );
      const previewPayout = (result.results ?? []).reduce(
        (sum, item) => sum + (item.payoutRecorded ?? 0),
        0
      );
      Alert.alert(
        x("Bulk preview ready", "बल्क प्रीव्यू तैयार"),
        x(
          `Rows ${result.requestedCount}, OK ${result.succeededCount}, Failed ${result.failedCount}\nReconciliations ${previewReconciliations}, Payout ${amount(previewPayout)}${failedMessages ? `\n${failedMessages}` : ""}`,
          `पंक्तियां ${result.requestedCount}, ठीक ${result.succeededCount}, असफल ${result.failedCount}\nरिकन्सिलिएशन ${previewReconciliations}, पेआउट ${amount(previewPayout)}${failedMessages ? `\n${failedMessages}` : ""}`
        )
      );
    } catch (e: any) {
      console.error(e);
      setStatementBulkPreviewResult(null);
      Alert.alert(
        x("Preview failed", "प्रीव्यू असफल"),
        e?.message ?? x("Could not preview month close.", "महीने का प्रीव्यू नहीं हुआ।")
      );
    } finally {
      setStatementBulkPreviewing(false);
    }
  };

  const renderDeliveryChecklist = () => {
    const totalTasks = deliveryTasks.length;
    const deliveredTasks = deliveryTasks.filter((row) => row.status === "DELIVERED").length;
    const pendingTasks = deliveryTasks.filter((row) => row.status === "PENDING").length;
    const plannedQty = deliveryTasks.reduce((sum, row) => sum + row.plannedQtyLiters, 0);
    const deliveredQty = deliveryTasks.reduce(
      (sum, row) => sum + (row.status === "DELIVERED" ? row.deliveredQtyLiters ?? row.plannedQtyLiters : 0),
      0
    );
    const totalAmount = deliveryItems.reduce((sum, row) => sum + row.totalAmount, 0);
    const pendingAmount = deliveryItems.reduce((sum, row) => sum + row.pendingAmount, 0);
    const routeCount = new Set(
      deliveryTasks.map((row) => row.routeName?.trim()).filter((row): row is string => Boolean(row))
    ).size;

    return (
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
          {x("Today Delivery Overview", "आज की डिलीवरी ओवरव्यू")}
        </Text>
        <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
          {x(
            "Execution is in Delivery Ops. Sales shows settlement and pending amount snapshot.",
            "कार्यान्वयन Delivery Ops में है। Sales स्क्रीन सिर्फ सेटलमेंट और बकाया स्नैपशॉट दिखाती है।"
          )}
        </Text>

        <DateInput
          value={dispatchDate}
          onChangeText={setDispatchDate}
          placeholder={x("Dispatch Date (YYYY-MM-DD)", "डिस्पैच तारीख (YYYY-MM-DD)")}
        />

        <View style={{ marginTop: 8, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Pressable
            onPress={() => router.push("/delivery-ops")}
            style={{
              borderRadius: 10,
              backgroundColor: DairyColors.primary,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: "white", fontWeight: "800" }}>
              {x("Open Delivery Ops", "डिलीवरी ऑप्स खोलें")}
            </Text>
          </Pressable>
          <Pressable
            disabled={deliveryLoading}
            onPress={() => void loadDelivery()}
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: DairyColors.border,
              backgroundColor: DairyColors.surface,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
              {deliveryLoading ? x("Refreshing...", "रिफ्रेश हो रहा है...") : x("Refresh", "रिफ्रेश")}
            </Text>
          </Pressable>
        </View>

        <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <View style={{ flex: 1, minWidth: 120, borderRadius: 10, backgroundColor: DairyColors.surfaceMuted, padding: 8 }}>
            <Text style={{ color: DairyColors.textSecondary }}>{x("Stops", "स्टॉप")}</Text>
            <Text style={{ marginTop: 3, color: DairyColors.textPrimary, fontWeight: "800" }}>{totalTasks}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 120, borderRadius: 10, backgroundColor: DairyColors.successSoft, padding: 8 }}>
            <Text style={{ color: DairyColors.textSecondary }}>{x("Delivered", "डिलीवर")}</Text>
            <Text style={{ marginTop: 3, color: DairyColors.textPrimary, fontWeight: "800" }}>{deliveredTasks}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 120, borderRadius: 10, backgroundColor: DairyColors.infoSoft, padding: 8 }}>
            <Text style={{ color: DairyColors.textSecondary }}>{x("Pending", "बाकी")}</Text>
            <Text style={{ marginTop: 3, color: DairyColors.textPrimary, fontWeight: "800" }}>{pendingTasks}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 120, borderRadius: 10, backgroundColor: DairyColors.accentSoft, padding: 8 }}>
            <Text style={{ color: DairyColors.textSecondary }}>{x("Routes", "रूट")}</Text>
            <Text style={{ marginTop: 3, color: DairyColors.textPrimary, fontWeight: "800" }}>{routeCount}</Text>
          </View>
        </View>

        <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
          {x(
            `Planned ${plannedQty.toFixed(2)} L | Delivered ${deliveredQty.toFixed(2)} L`,
            `योजना ${plannedQty.toFixed(2)} L | डिलीवर ${deliveredQty.toFixed(2)} L`
          )}
        </Text>
        <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
          {x(
            `Total amount ${amount(totalAmount)} | Pending collection ${amount(pendingAmount)}`,
            `कुल राशि ${amount(totalAmount)} | बाकी वसूली ${amount(pendingAmount)}`
          )}
        </Text>
      </View>
    );
  };

  const renderOfflineSyncStatus = () => (
    <View
      style={{
        marginTop: 10,
        borderWidth: 1,
        borderColor: DairyColors.border,
        borderRadius: 10,
        backgroundColor: salesPendingCount > 0 ? DairyColors.warningSoft : DairyColors.successSoft,
        padding: 10,
      }}
    >
      <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
        {salesPendingCount > 0 ? x("Sales Sync Pending", "सेल्स सिंक बाकी") : x("Sales Synced", "सेल्स सिंक")}
      </Text>
      <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
        {x(
          `Sale save ${pendingSync.saleSave} | Delivery ${pendingSync.saleDeliveryUpdate + pendingSync.deliveryTaskStatus} | Reconcile ${pendingSync.saleReconcileUpdate} | Dead letter ${pendingSync.deadLetter}`,
          `सेल सेव ${pendingSync.saleSave} | डिलीवरी ${pendingSync.saleDeliveryUpdate + pendingSync.deliveryTaskStatus} | रिकन्सिलिएशन ${pendingSync.saleReconcileUpdate} | डेड लेटर ${pendingSync.deadLetter}`
        )}
      </Text>
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
        {renderOfflineSyncStatus()}
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

      {renderOfflineSyncStatus()}

      {canManageSales ? (
        <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Pressable
          onPress={() => setListFilter("ALL")}
          style={{
            flex: 1,
            minWidth: 140,
            borderWidth: 1,
            borderColor: listFilter === "ALL" ? DairyColors.primary : "transparent",
            backgroundColor: listFilter === "ALL" ? DairyColors.primarySoft : DairyColors.accentSoft,
            borderRadius: 12,
            padding: 10,
          }}
        >
          <Text style={{ color: DairyColors.textSecondary }}>{x("Revenue", "कुल आय")}</Text>
          <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>{amount(summary?.totalRevenue ?? 0)}</Text>
        </Pressable>
        <Pressable
          onPress={() => setListFilter("RECEIVED")}
          style={{
            flex: 1,
            minWidth: 140,
            borderWidth: 1,
            borderColor: listFilter === "RECEIVED" ? DairyColors.primary : "transparent",
            backgroundColor: listFilter === "RECEIVED" ? DairyColors.primarySoft : DairyColors.successSoft,
            borderRadius: 12,
            padding: 10,
          }}
        >
          <Text style={{ color: DairyColors.textSecondary }}>{x("Received", "मिला भुगतान")}</Text>
          <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>{amount(summary?.totalReceived ?? 0)}</Text>
        </Pressable>
        <Pressable
          onPress={() => setListFilter("PENDING")}
          style={{
            flex: 1,
            minWidth: 140,
            borderWidth: 1,
            borderColor: listFilter === "PENDING" ? DairyColors.primary : "transparent",
            backgroundColor: listFilter === "PENDING" ? DairyColors.primarySoft : DairyColors.warningSoft,
            borderRadius: 12,
            padding: 10,
          }}
        >
          <Text style={{ color: DairyColors.textSecondary }}>{x("Pending", "बाकी")}</Text>
          <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>{amount(summary?.totalPending ?? 0)}</Text>
        </Pressable>
        </View>
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
        <DateInput
          value={dispatchDate}
          onChangeText={(value) => {
            setSaleFormInvoiceLock(null);
            setSaleFormInvoiceLockLoading(true);
            setSaleFormInvoiceOverrideEnabled(false);
            setSaleFormInvoiceOverrideReason("");
            setDispatchDate(value);
          }}
          placeholder={x("YYYY-MM-DD", "YYYY-MM-DD")}
        />

        <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
          {x("Customer (daily subscriptions pre-listed)", "ग्राहक (दैनिक ग्राहक पहले से सूची में)")}
        </Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          {(customerRecords.length > 0 ? customerRecords.slice(0, 10) : []).map((row) => (
            <Pressable
              key={row.customerId}
              onPress={() => {
                setSaleFormInvoiceLock(null);
                setSaleFormInvoiceLockLoading(true);
                setSaleFormInvoiceOverrideEnabled(false);
                setSaleFormInvoiceOverrideReason("");
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
                    setSaleFormInvoiceLock(null);
                    setSaleFormInvoiceLockLoading(true);
                    setSaleFormInvoiceOverrideEnabled(false);
                    setSaleFormInvoiceOverrideReason("");
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

        {saleFormInvoiceLockLoading && selectedSaleCustomer?.subscriptionActive ? (
          <View
            style={{
              marginTop: 8,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: DairyColors.info,
              backgroundColor: DairyColors.infoSoft,
              padding: 10,
            }}
          >
            <Text style={{ color: DairyColors.info, fontWeight: "700" }}>
              {x("Checking invoice lifecycle lock...", "इनवॉइस लाइफसाइकल लॉक जांचा जा रहा है...")}
            </Text>
          </View>
        ) : null}

        {saleFormInvoiceLock ? (
          <View
            style={{
              marginTop: 8,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: DairyColors.warning,
              backgroundColor: DairyColors.warningSoft,
              padding: 10,
            }}
          >
            <Text style={{ color: DairyColors.warning, fontWeight: "800" }}>
              {x(
                `Invoice ${saleFormInvoiceLock.invoiceNumber} (${saleFormInvoiceLock.month}) is ${saleFormInvoiceLock.status}. Sale form is read-only by default.`,
                `इनवॉइस ${saleFormInvoiceLock.invoiceNumber} (${saleFormInvoiceLock.month}) ${saleFormInvoiceLock.status} है। बिक्री फॉर्म डिफ़ॉल्ट रूप से रीड-ओनली है।`
              )}
            </Text>
            <Text style={{ marginTop: 4, color: DairyColors.warning }}>
              {x(
                `Issue ${saleFormInvoiceLock.issueDate} | Due ${saleFormInvoiceLock.dueDate}`,
                `जारी ${saleFormInvoiceLock.issueDate} | देय ${saleFormInvoiceLock.dueDate}`
              )}
            </Text>
            <Pressable
              onPress={() => setSaleFormInvoiceOverrideEnabled((prev) => !prev)}
              style={{
                marginTop: 8,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: saleFormInvoiceOverrideEnabled ? DairyColors.warning : DairyColors.border,
                backgroundColor: saleFormInvoiceOverrideEnabled ? DairyColors.surface : DairyColors.surfaceMuted,
                paddingVertical: 8,
                alignItems: "center",
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                {saleFormInvoiceOverrideEnabled
                  ? x("Disable Invoice Override", "इनवॉइस ओवरराइड बंद करें")
                  : x("Enable Invoice Override (ADMIN/MANAGER)", "इनवॉइस ओवरराइड चालू करें (ADMIN/MANAGER)")}
              </Text>
            </Pressable>
            {saleFormInvoiceOverrideEnabled ? (
              <TextInput
                value={saleFormInvoiceOverrideReason}
                onChangeText={setSaleFormInvoiceOverrideReason}
                placeholder={x("Override reason (required)", "ओवरराइड कारण (जरूरी)")}
                placeholderTextColor="#99A99A"
                style={{
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: DairyColors.warning,
                  borderRadius: 10,
                  padding: 10,
                  color: DairyColors.textPrimary,
                  backgroundColor: DairyColors.surface,
                }}
              />
            ) : null}
          </View>
        ) : null}

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
            <DateInput
              value={batchDate}
              onChangeText={setBatchDate}
              placeholder={x("Batch date (YYYY-MM-DD)", "बैच तारीख (YYYY-MM-DD)")}
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
          disabled={saleSaveDisabled}
          onPress={saveSale}
          style={{
            marginTop: 10,
            padding: 12,
            borderRadius: 10,
            backgroundColor: saleSaveDisabled ? DairyColors.textSecondary : DairyColors.primary,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "800" }}>
            {saleFormInvoiceLockLoading
              ? x("Checking Invoice...", "इनवॉइस जांच रहे हैं...")
              : saleFormLockedByInvoice
                ? x("Invoice Locked", "इनवॉइस लॉक")
                : saleFormOverrideReasonRequired
                  ? x("Add Override Reason", "ओवरराइड कारण जोड़ें")
                  : saving
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
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "800", color: DairyColors.textPrimary, fontSize: 16 }}>
                {x("Month-end Subscription Settlement", "महीने का सब्सक्रिप्शन सेटलमेंट")}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {statementRange
                  ? x(
                      `Range: ${statementRange.from} to ${statementRange.to}`,
                      `रेंज: ${statementRange.from} से ${statementRange.to}`
                    )
                  : x("Set month in YYYY-MM format.", "महीना YYYY-MM फॉर्मेट में भरें।")}
              </Text>
            </View>
            <Pressable
              onPress={() => void loadMonthStatement()}
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
              <Ionicons name={statementLoading ? "sync-circle" : "refresh"} size={18} color={DairyColors.primary} />
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <TextInput
              value={statementMonth}
              onChangeText={(value) => {
                setStatementMonth(value);
                setStatementBulkPreviewResult(null);
              }}
              placeholder={x("Month (YYYY-MM)", "महीना (YYYY-MM)")}
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
            <Pressable
              onPress={() => void loadMonthStatement()}
              style={{
                borderRadius: 10,
                paddingHorizontal: 12,
                justifyContent: "center",
                backgroundColor: DairyColors.primary,
              }}
            >
              <Text style={{ color: "white", fontWeight: "800" }}>{x("Load", "लोड")}</Text>
            </Pressable>
          </View>

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
              {x("Subscription Invoice Generator", "सब्सक्रिप्शन इनवॉइस जेनरेटर")}
            </Text>
            <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
              {x(
                "Generate invoice-ready month statement with proration and holiday credits.",
                "प्रोरेशन और हॉलिडे क्रेडिट के साथ इनवॉइस-रेडी मासिक स्टेटमेंट बनाएं।"
              )}
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
              {subscriptionCustomers.length === 0 ? (
                <Text style={{ color: DairyColors.textSecondary }}>
                  {x("No active subscription customers.", "कोई सक्रिय सब्सक्रिप्शन ग्राहक नहीं।")}
                </Text>
              ) : (
                subscriptionCustomers.slice(0, 24).map((row) => {
                  const selected = subscriptionInvoiceCustomerId === row.customerId;
                  return (
                    <Pressable
                      key={`invoice-customer-${row.customerId}`}
                      onPress={() => setSubscriptionInvoiceCustomerId(row.customerId)}
                      style={{
                        marginRight: 8,
                        marginBottom: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: selected ? DairyColors.primary : DairyColors.border,
                        backgroundColor: selected ? DairyColors.primarySoft : DairyColors.surface,
                      }}
                    >
                      <Text style={{ color: selected ? DairyColors.primary : DairyColors.textPrimary, fontWeight: "700" }}>
                        {row.customerName}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              <Pressable
                onPress={() => setSubscriptionInvoiceIncludeDaily((prev) => !prev)}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: subscriptionInvoiceIncludeDaily ? DairyColors.info : DairyColors.border,
                  backgroundColor: subscriptionInvoiceIncludeDaily ? DairyColors.infoSoft : DairyColors.surface,
                  paddingVertical: 10,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                  {subscriptionInvoiceIncludeDaily
                    ? x("Daily rows: ON", "डेली पंक्तियां: ON")
                    : x("Daily rows: OFF", "डेली पंक्तियां: OFF")}
                </Text>
              </Pressable>
              <Pressable
                disabled={subscriptionInvoiceLoading || !subscriptionInvoiceCustomerId}
                onPress={() => void loadSubscriptionInvoice()}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  paddingVertical: 10,
                  alignItems: "center",
                  backgroundColor:
                    subscriptionInvoiceLoading || !subscriptionInvoiceCustomerId
                      ? DairyColors.textSecondary
                      : DairyColors.primary,
                }}
              >
                <Text style={{ color: "white", fontWeight: "800" }}>
                  {subscriptionInvoiceLoading ? x("Loading...", "लोड...") : x("Generate Invoice", "इनवॉइस बनाएं")}
                </Text>
              </Pressable>
            </View>

            {subscriptionInvoice ? (
              <View
                style={{
                  marginTop: 8,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  backgroundColor: DairyColors.surface,
                  padding: 10,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                    {subscriptionInvoice.invoiceNumber}
                  </Text>
                  <View
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      backgroundColor: invoiceStatusTone(subscriptionInvoice.status).background,
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: "800",
                        color: invoiceStatusTone(subscriptionInvoice.status).text,
                      }}
                    >
                      {subscriptionInvoice.status}
                    </Text>
                  </View>
                </View>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x(
                    `Issue ${subscriptionInvoice.issueDate} | Due ${subscriptionInvoice.dueDate} | Proration ${subscriptionInvoice.prorationFactor}`,
                    `जारी ${subscriptionInvoice.issueDate} | देय ${subscriptionInvoice.dueDate} | प्रोरेशन ${subscriptionInvoice.prorationFactor}`
                  )}
                </Text>
                {subscriptionInvoice.lastStatusUpdatedAt ? (
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                    {x(
                      `Status updated by ${subscriptionInvoice.lastStatusUpdatedBy ?? "unknown"} at ${subscriptionInvoice.lastStatusUpdatedAt}`,
                      `स्टेटस अपडेट ${subscriptionInvoice.lastStatusUpdatedBy ?? "unknown"} द्वारा ${subscriptionInvoice.lastStatusUpdatedAt}`
                    )}
                  </Text>
                ) : null}
                {subscriptionInvoice.statusNote ? (
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                    {x(
                      `Status note: ${subscriptionInvoice.statusNote}`,
                      `स्टेटस नोट: ${subscriptionInvoice.statusNote}`
                    )}
                  </Text>
                ) : null}

                <View
                  style={{
                    marginTop: 8,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    backgroundColor: DairyColors.surfaceMuted,
                    padding: 8,
                  }}
                >
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                    {x("Invoice Status Timeline", "इनवॉइस स्टेटस टाइमलाइन")}
                  </Text>
                  {subscriptionInvoiceAuditsLoading ? (
                    <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                      {x("Loading timeline...", "टाइमलाइन लोड हो रही है...")}
                    </Text>
                  ) : subscriptionInvoiceStatusAudits.length === 0 ? (
                    <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                      {x("No status transitions recorded yet.", "अभी कोई स्टेटस बदलाव रिकॉर्ड नहीं है।")}
                    </Text>
                  ) : (
                    subscriptionInvoiceStatusAudits.slice(0, 8).map((row, index) => (
                      <View
                        key={row.subscriptionInvoiceStatusAuditId}
                        style={{
                          marginTop: index === 0 ? 6 : 8,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: DairyColors.border,
                          backgroundColor: DairyColors.surface,
                          padding: 8,
                        }}
                      >
                        <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                          {x(
                            `${row.action}: ${row.previousStatus} → ${row.currentStatus}`,
                            `${row.action}: ${row.previousStatus} → ${row.currentStatus}`
                          )}
                        </Text>
                        <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                          {x(
                            `${row.createdAt} | by ${row.actorUsername}`,
                            `${row.createdAt} | द्वारा ${row.actorUsername}`
                          )}
                        </Text>
                        {row.statusNote ? (
                          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                            {x(`Note: ${row.statusNote}`, `नोट: ${row.statusNote}`)}
                          </Text>
                        ) : null}
                        {row.overrideReason ? (
                          <Text style={{ marginTop: 2, color: DairyColors.warning, fontWeight: "700" }}>
                            {x(`Override reason: ${row.overrideReason}`, `ओवरराइड कारण: ${row.overrideReason}`)}
                          </Text>
                        ) : null}
                        {row.exceptionOverride ? (
                          <Text style={{ marginTop: 2, color: DairyColors.info }}>
                            {x(
                              `Exception override approved by ${row.approvedBy ?? "unknown"}.`,
                              `एक्सेप्शन ओवरराइड ${row.approvedBy ?? "unknown"} द्वारा अनुमोदित।`
                            )}
                          </Text>
                        ) : null}
                      </View>
                    ))
                  )}
                </View>

                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x(
                    `Opening ${amount(subscriptionInvoice.openingPendingAmount)} | Closing ${amount(subscriptionInvoice.closingPendingAmount)} | Running ${amount(subscriptionInvoice.currentRunningBalance)}`,
                    `ओपनिंग ${amount(subscriptionInvoice.openingPendingAmount)} | क्लोजिंग ${amount(subscriptionInvoice.closingPendingAmount)} | रनिंग ${amount(subscriptionInvoice.currentRunningBalance)}`
                  )}
                </Text>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x(
                    `Planned ${amount(subscriptionInvoice.plannedAmount)} | Billed ${amount(subscriptionInvoice.billedAmount)} | Received ${amount(subscriptionInvoice.receivedAmount)} | Pending ${amount(subscriptionInvoice.pendingAmount)}`,
                    `प्लान ${amount(subscriptionInvoice.plannedAmount)} | बिल ${amount(subscriptionInvoice.billedAmount)} | मिला ${amount(subscriptionInvoice.receivedAmount)} | बाकी ${amount(subscriptionInvoice.pendingAmount)}`
                  )}
                </Text>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x(
                    `Holiday credit ${amount(subscriptionInvoice.holidayCreditAmount)} | Add-on ${amount(subscriptionInvoice.addOnBilledAmount)} | Under-delivery credit ${amount(subscriptionInvoice.underDeliveryCreditAmount)}`,
                    `हॉलिडे क्रेडिट ${amount(subscriptionInvoice.holidayCreditAmount)} | ऐड-ऑन ${amount(subscriptionInvoice.addOnBilledAmount)} | कम डिलीवरी क्रेडिट ${amount(subscriptionInvoice.underDeliveryCreditAmount)}`
                  )}
                </Text>

                <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
                  <Pressable
                    disabled={subscriptionInvoiceUpdatingStatus || subscriptionInvoice.status !== "DRAFT"}
                    onPress={() => void updateSubscriptionInvoiceStatus("FINALIZE")}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: "center",
                      backgroundColor:
                        subscriptionInvoiceUpdatingStatus || subscriptionInvoice.status !== "DRAFT"
                          ? DairyColors.textSecondary
                          : DairyColors.info,
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "800" }}>
                      {x("Finalize", "फाइनल करें")}
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={subscriptionInvoiceUpdatingStatus || subscriptionInvoice.status !== "FINALIZED"}
                    onPress={() => void updateSubscriptionInvoiceStatus("POST")}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: "center",
                      backgroundColor:
                        subscriptionInvoiceUpdatingStatus || subscriptionInvoice.status !== "FINALIZED"
                          ? DairyColors.textSecondary
                          : DairyColors.primary,
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "800" }}>
                      {x("Post", "पोस्ट करें")}
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={subscriptionInvoiceUpdatingStatus || !isAdmin || subscriptionInvoice.status === "DRAFT"}
                    onPress={() => void updateSubscriptionInvoiceStatus("REOPEN")}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: "center",
                      backgroundColor:
                        subscriptionInvoiceUpdatingStatus || !isAdmin || subscriptionInvoice.status === "DRAFT"
                          ? DairyColors.textSecondary
                          : DairyColors.warning,
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "800" }}>
                      {x("Reopen (Admin)", "रीओपन (एडमिन)")}
                    </Text>
                  </Pressable>
                </View>

                {isAdmin && subscriptionInvoice.status !== "DRAFT" ? (
                  <TextInput
                    value={subscriptionInvoiceReopenReason}
                    onChangeText={setSubscriptionInvoiceReopenReason}
                    placeholder={x("Reopen reason (required for admin reopen)", "रीओपन कारण (एडमिन के लिए जरूरी)")}
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
                ) : null}

                {subscriptionInvoice.invoiceLineItems.length > 0 ? (
                  <View style={{ marginTop: 8 }}>
                    {subscriptionInvoice.invoiceLineItems.map((item, index) => (
                      <Text key={`invoice-item-${item.code}-${index}`} style={{ marginTop: index === 0 ? 0 : 3, color: DairyColors.textSecondary }}>
                        {`${index + 1}. ${item.label}: ${amount(item.amount)}`}
                      </Text>
                    ))}
                  </View>
                ) : null}

                {subscriptionInvoiceIncludeDaily && subscriptionInvoice.dailyRows.length > 0 ? (
                  <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
                    {x(
                      `Daily rows loaded: ${subscriptionInvoice.dailyRows.length}`,
                      `डेली पंक्तियां लोड: ${subscriptionInvoice.dailyRows.length}`
                    )}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <View style={{ marginTop: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "700", flex: 1 }}>
                  {x("Invoice summary (all subscription customers)", "इनवॉइस सारांश (सभी सब्सक्रिप्शन ग्राहक)")}
                </Text>
                <Pressable
                  disabled={subscriptionInvoiceExporting || subscriptionInvoiceSummariesLoading}
                  onPress={() => void exportSubscriptionInvoicesCsv()}
                  style={{
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    backgroundColor:
                      subscriptionInvoiceExporting || subscriptionInvoiceSummariesLoading
                        ? DairyColors.textSecondary
                        : DairyColors.info,
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "700" }}>
                    {subscriptionInvoiceExporting
                      ? x("Exporting...", "एक्सपोर्ट...")
                      : x("Export CSV", "CSV एक्सपोर्ट")}
                  </Text>
                </Pressable>
              </View>
              {subscriptionInvoiceSummariesLoading ? (
                <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>{x("Loading...", "लोड...")}</Text>
              ) : subscriptionInvoiceSummaries.length === 0 ? (
                <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                  {x("No subscription invoice rows for selected month.", "चुने हुए महीने के लिए कोई इनवॉइस रिकॉर्ड नहीं है।")}
                </Text>
              ) : (
                subscriptionInvoiceSummaries.slice(0, 12).map((row) => (
                  <View
                    key={`invoice-summary-${row.customerId}`}
                    style={{
                      marginTop: 6,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: DairyColors.border,
                      backgroundColor: DairyColors.surface,
                      padding: 8,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                        {`${row.customerName} (${row.invoiceNumber})`}
                      </Text>
                      <View
                        style={{
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          backgroundColor: invoiceStatusTone(row.status).background,
                        }}
                      >
                        <Text style={{ color: invoiceStatusTone(row.status).text, fontWeight: "700" }}>{row.status}</Text>
                      </View>
                    </View>
                    <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                      {x(
                        `Billed ${amount(row.billedAmount)} | Received ${amount(row.receivedAmount)} | Pending ${amount(row.pendingAmount)} | Closing ${amount(row.closingPendingAmount)}`,
                        `बिल ${amount(row.billedAmount)} | मिला ${amount(row.receivedAmount)} | बाकी ${amount(row.pendingAmount)} | क्लोजिंग ${amount(row.closingPendingAmount)}`
                      )}
                    </Text>
                  </View>
                ))
              )}
            </View>

            <View style={{ marginTop: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "700", flex: 1 }}>
                  {x("Monthly subscription statement summary", "मासिक सब्सक्रिप्शन स्टेटमेंट सारांश")}
                </Text>
                <Pressable
                  disabled={subscriptionStatementExporting || subscriptionInvoiceSummariesLoading}
                  onPress={() => void exportSubscriptionStatementsCsv()}
                  style={{
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    backgroundColor:
                      subscriptionStatementExporting || subscriptionInvoiceSummariesLoading
                        ? DairyColors.textSecondary
                        : DairyColors.info,
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "700" }}>
                    {subscriptionStatementExporting
                      ? x("Exporting...", "एक्सपोर्ट...")
                      : x("Export CSV", "CSV एक्सपोर्ट")}
                  </Text>
                </Pressable>
              </View>
              {subscriptionInvoiceSummariesLoading ? (
                <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>{x("Loading...", "लोड...")}</Text>
              ) : subscriptionStatementSummaries.length === 0 ? (
                <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                  {x("No subscription statement rows for selected month.", "चुने हुए महीने के लिए कोई स्टेटमेंट रिकॉर्ड नहीं है।")}
                </Text>
              ) : (
                subscriptionStatementSummaries.slice(0, 12).map((row) => (
                  <View
                    key={`statement-summary-${row.customerId}`}
                    style={{
                      marginTop: 6,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: DairyColors.border,
                      backgroundColor: DairyColors.surface,
                      padding: 8,
                    }}
                  >
                    <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                      {row.customerName}
                      {row.routeName ? ` | ${row.routeName}` : ""}
                    </Text>
                    <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                      {x(
                        `Planned ${amount(row.plannedAmount)} | Billed ${amount(row.billedAmount)} | Pending ${amount(row.pendingAmount)} | Variance ${amount(row.expectedVsBilledVariance)}`,
                        `प्लान ${amount(row.plannedAmount)} | बिल ${amount(row.billedAmount)} | बाकी ${amount(row.pendingAmount)} | अंतर ${amount(row.expectedVsBilledVariance)}`
                      )}
                    </Text>
                    <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                      {x(
                        `Proration ${row.prorationFactor} | Active ${row.activePlanDays} | Paused ${row.pausedDays} | Skip ${row.skipDays} | Weekly holiday ${row.holidayWeekdayDays}`,
                        `प्रोरेशन ${row.prorationFactor} | एक्टिव ${row.activePlanDays} | पॉज़ ${row.pausedDays} | स्किप ${row.skipDays} | साप्ताहिक छुट्टी ${row.holidayWeekdayDays}`
                      )}
                    </Text>
                  </View>
                ))
              )}
            </View>

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
                {x("Invoice Exception & Approval View", "इनवॉइस एक्सेप्शन और अप्रूवल व्यू")}
              </Text>
              <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                {x(
                  `Transitions ${monthInvoiceExceptionSummary.totalTransitions} | Exceptions ${monthInvoiceExceptionSummary.exceptionRows.length} | Approved ${monthInvoiceExceptionSummary.approvedCount} | Pending review ${monthInvoiceExceptionSummary.pendingCount}`,
                  `ट्रांजिशन ${monthInvoiceExceptionSummary.totalTransitions} | एक्सेप्शन ${monthInvoiceExceptionSummary.exceptionRows.length} | अप्रूव्ड ${monthInvoiceExceptionSummary.approvedCount} | रिव्यू लंबित ${monthInvoiceExceptionSummary.pendingCount}`
                )}
              </Text>
              {subscriptionInvoiceSummariesLoading ? (
                <Text style={{ marginTop: 6, color: DairyColors.textSecondary }}>
                  {x("Loading approval view...", "अप्रूवल व्यू लोड हो रहा है...")}
                </Text>
              ) : monthInvoiceExceptionSummary.exceptionRows.length === 0 ? (
                <Text style={{ marginTop: 6, color: DairyColors.textSecondary }}>
                  {x("No invoice exceptions recorded for this month.", "इस महीने के लिए कोई इनवॉइस एक्सेप्शन रिकॉर्ड नहीं है।")}
                </Text>
              ) : (
                monthInvoiceExceptionSummary.exceptionRows.slice(0, 12).map((row) => {
                  const approved = !!row.approvedBy?.trim();
                  return (
                    <View
                      key={`invoice-exception-${row.subscriptionInvoiceStatusAuditId}`}
                      style={{
                        marginTop: 8,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: DairyColors.border,
                        backgroundColor: approved ? DairyColors.successSoft : DairyColors.warningSoft,
                        padding: 8,
                      }}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <Text style={{ color: DairyColors.textPrimary, fontWeight: "700", flex: 1 }}>
                          {`${row.customerName} (${row.invoiceNumber})`}
                        </Text>
                        <View
                          style={{
                            borderRadius: 999,
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            backgroundColor: approved ? DairyColors.success : DairyColors.warning,
                          }}
                        >
                          <Text style={{ color: "white", fontWeight: "700" }}>
                            {approved ? x("APPROVED", "APPROVED") : x("REVIEW", "REVIEW")}
                          </Text>
                        </View>
                      </View>
                      <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                        {x(
                          `${row.action}: ${row.previousStatus} → ${row.currentStatus}`,
                          `${row.action}: ${row.previousStatus} → ${row.currentStatus}`
                        )}
                      </Text>
                      <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                        {x(`${row.createdAt} | by ${row.actorUsername}`, `${row.createdAt} | द्वारा ${row.actorUsername}`)}
                      </Text>
                      {row.overrideReason ? (
                        <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                          {x(`Override reason: ${row.overrideReason}`, `ओवरराइड कारण: ${row.overrideReason}`)}
                        </Text>
                      ) : null}
                      {row.statusNote ? (
                        <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                          {x(`Status note: ${row.statusNote}`, `स्टेटस नोट: ${row.statusNote}`)}
                        </Text>
                      ) : null}
                      <Text style={{ marginTop: 2, color: approved ? DairyColors.success : DairyColors.warning, fontWeight: "700" }}>
                        {approved
                          ? x(`Approved by ${row.approvedBy}`, `अनुमोदन: ${row.approvedBy}`)
                          : x("Pending approval review", "अनुमोदन समीक्षा लंबित")}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>
          </View>

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
              {x("Close checklist", "क्लोज़ चेकलिस्ट")}
            </Text>
            <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
              {x("1. Review customer totals and pending amount.", "1. ग्राहक का कुल और बकाया रिव्यू करें।")}
            </Text>
            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
              {x(
                "2. Review cooperative open reconciliations.",
                "2. कोऑपरेटिव के खुले रिकन्सिलिएशन रिव्यू करें।"
              )}
            </Text>
            <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
              {x(
                "3. Close month: reconcile + record payout.",
                "3. महीना बंद करें: रिकन्साइल + पेआउट रिकॉर्ड।"
              )}
            </Text>
          </View>

          <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
            <Pressable
              disabled={statementBulkPreviewing || statementBulkClosing || statementRows.length === 0}
              onPress={() => void previewMonthSettlementBulk()}
              style={{
                flex: 1,
                borderRadius: 10,
                paddingVertical: 11,
                alignItems: "center",
                backgroundColor:
                  statementBulkPreviewing || statementBulkClosing || statementRows.length === 0
                    ? DairyColors.textSecondary
                    : DairyColors.info,
              }}
            >
              <Text style={{ color: "white", fontWeight: "800" }}>
                {statementBulkPreviewing
                  ? x("Previewing...", "प्रीव्यू हो रहा है...")
                  : x("Preview Bulk Close", "बल्क क्लोज़ प्रीव्यू")}
              </Text>
            </Pressable>
            <Pressable
              disabled={statementBulkClosing || statementBulkPreviewing || statementRows.length === 0}
              onPress={() => void closeMonthSettlementBulk()}
              style={{
                flex: 1,
                borderRadius: 10,
                paddingVertical: 11,
                alignItems: "center",
                backgroundColor:
                  statementBulkClosing || statementBulkPreviewing || statementRows.length === 0
                    ? DairyColors.textSecondary
                    : DairyColors.primary,
              }}
            >
              <Text style={{ color: "white", fontWeight: "800" }}>
                {statementBulkClosing
                  ? x("Closing all...", "सभी क्लोज़ हो रहे हैं...")
                  : x("Close All Pending Rows", "सभी लंबित पंक्तियां बंद करें")}
              </Text>
            </Pressable>
          </View>

          {statementBulkPreviewResult && statementBulkPreviewSummary ? (
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
                {x("Latest bulk preview", "नवीनतम बल्क प्रीव्यू")}
              </Text>
              <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                {x(
                  `Rows ${statementBulkPreviewResult.requestedCount} | OK ${statementBulkPreviewResult.succeededCount} | Failed ${statementBulkPreviewResult.failedCount}`,
                  `पंक्तियां ${statementBulkPreviewResult.requestedCount} | ठीक ${statementBulkPreviewResult.succeededCount} | असफल ${statementBulkPreviewResult.failedCount}`
                )}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x(
                  `Reconciliations ${statementBulkPreviewSummary.reconciled} | Payout ${amount(statementBulkPreviewSummary.payout)}`,
                  `रिकन्सिलिएशन ${statementBulkPreviewSummary.reconciled} | पेआउट ${amount(statementBulkPreviewSummary.payout)}`
                )}
              </Text>
              {statementBulkPreviewSummary.failures.length === 0 ? (
                <Text style={{ marginTop: 4, color: DairyColors.success, fontWeight: "700" }}>
                  {x("No failures in preview.", "प्रीव्यू में कोई असफलता नहीं।")}
                </Text>
              ) : (
                <>
                  <Text style={{ marginTop: 4, color: DairyColors.warning, fontWeight: "700" }}>
                    {x("Top preview failures", "मुख्य प्रीव्यू असफलताएं")}
                  </Text>
                  {statementBulkPreviewSummary.failures.map((item, index) => (
                    <Text
                      key={`preview-fail-${index}-${item.customerName}`}
                      style={{ marginTop: 2, color: DairyColors.textSecondary }}
                    >
                      {`${index + 1}. ${item.customerName}: ${item.message}`}
                    </Text>
                  ))}
                </>
              )}
            </View>
          ) : null}

          {!statementRange ? (
            <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
              {x("Use month format YYYY-MM.", "महीना YYYY-MM फॉर्मेट में डालें।")}
            </Text>
          ) : statementRows.length === 0 ? (
            <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
              {statementLoading
                ? x("Loading month statement...", "महीने का स्टेटमेंट लोड हो रहा है...")
                : x("No month statement rows found.", "महीने के लिए कोई स्टेटमेंट रिकॉर्ड नहीं मिला।")}
            </Text>
          ) : (
            statementRows.map((row) => {
              const key = statementKey(row.customerType, row.customerName);
              const recon = statementReconciliationByKey.get(key);
              const openReconciliations = recon?.unreconciledTransactions ?? 0;
              const payoutText = statementPayoutByCustomer[key] ?? "";
              const payoutValue = payoutText.trim() ? Number(payoutText) : 0;
              const canClose = openReconciliations > 0 || (Number.isFinite(payoutValue) && payoutValue > 0);
              const isClosing = statementClosingKey === key;
              return (
                <View
                  key={`statement-${key}`}
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
                    {row.customerName} ({customerTypeLabel(row.customerType)})
                  </Text>
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                    {x(
                      `Amount ${amount(row.totalAmount)} | Received ${amount(row.totalReceived)} | Pending ${amount(row.totalPending)}`,
                      `राशि ${amount(row.totalAmount)} | मिला ${amount(row.totalReceived)} | बाकी ${amount(row.totalPending)}`
                    )}
                  </Text>
                  <Text style={{ marginTop: 2, color: openReconciliations > 0 ? DairyColors.warning : DairyColors.textSecondary }}>
                    {x(
                      `Cooperative reconciliations open: ${openReconciliations}`,
                      `कोऑपरेटिव रिकन्सिलिएशन खुले: ${openReconciliations}`
                    )}
                  </Text>
                  <View style={{ marginTop: 8, flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <TextInput
                      value={payoutText}
                      onChangeText={(value) => {
                        setStatementBulkPreviewResult(null);
                        setStatementPayoutByCustomer((prev) => ({
                          ...prev,
                          [key]: value,
                        }));
                      }}
                      placeholder={x("Payout amount (optional)", "पेआउट राशि (वैकल्पिक)")}
                      placeholderTextColor="#99A99A"
                      keyboardType="decimal-pad"
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: DairyColors.border,
                        borderRadius: 10,
                        padding: 10,
                        color: DairyColors.textPrimary,
                        backgroundColor: DairyColors.surface,
                      }}
                    />
                    <Pressable
                      disabled={!canClose || isClosing}
                      onPress={() => void closeMonthSettlement(row)}
                      style={{
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        backgroundColor: !canClose || isClosing ? DairyColors.textSecondary : DairyColors.primary,
                      }}
                    >
                      <Text style={{ color: "white", fontWeight: "800" }}>
                        {isClosing
                          ? x("Closing...", "बंद हो रहा है...")
                          : x("Close Month", "महीना बंद करें")}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
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
            {x("No ledger rows for selected date.", "चुनी हुई तारीख के लिए कोई हिसाब रिकॉर्ड नहीं है।")}
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
        <Text style={{ marginTop: 3, color: DairyColors.textSecondary }}>
          {x(`Showing: ${listFilterLabel(listFilter)}`, `दिखा रहे हैं: ${listFilterLabel(listFilter)}`)}
        </Text>
        {filteredSales.length === 0 ? (
          <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
            {loading
              ? x("Loading sales...", "बिक्री लोड हो रही है...")
              : x("No sales found for selected date.", "चुनी हुई तारीख के लिए कोई बिक्री नहीं मिली।")}
          </Text>
        ) : (
          filteredSales.map((item) => {
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
                    {canManageSales ? (
                      <Pressable
                        disabled={reconcilingSaleId === item.saleId}
                        onPress={() => updateReconciliation(item, !isReconciled)}
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
                    ) : null}
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
