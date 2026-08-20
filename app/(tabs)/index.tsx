import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { DairyColors } from "@/src/constants/dairy-theme";
import {
  DeliveryChecklistItemResponse,
  CustomerLedgerRowResponse,
  DailyReportResponse,
  ExpenseApi,
  ExpensesSummaryResponse,
  FeedManagementApi,
  FeedManagementSummaryResponse,
  HealthApi,
  HealthSummaryResponse,
  MilkApi,
  MilkBatchResponse,
  QcStatus,
  ReportApi,
  SalesApi,
  SalesSummaryResponse,
  WeeklyTrendPointResponse,
  WeeklyTrendResponse,
} from "@/src/services/api";
import { shiftIsoDate, shortWeekLabel, todayLocalISO } from "@/src/utils/date";
import { useI18n } from "@/src/state/i18n";
import { useAuth } from "@/src/state/auth";

type StatusTone = {
  background: string;
  text: string;
  dot: string;
};

type DashboardRoute =
  | "/health"
  | "/treatments"
  | "/breeding"
  | "/sales"
  | "/delivery-ops"
  | "/services"
  | "/feed"
  | "/tasks"
  | "/stock"
  | "/milk"
  | "/today-tasks"
  | "/qc";

type QuickAction = {
  key: string;
  label: string;
  href: DashboardRoute;
};

const liters = (value: number) => `${value.toFixed(2)} L`;
const money = (value: number) => `Rs ${value.toFixed(2)}`;
const percentage = (value: number) => `${Math.round(value * 100)}%`;

function getStatusTone(status?: QcStatus | null): StatusTone {
  if (status === "PASS") {
    return {
      background: DairyColors.successSoft,
      text: DairyColors.success,
      dot: DairyColors.success,
    };
  }
  if (status === "HOLD") {
    return {
      background: DairyColors.warningSoft,
      text: DairyColors.warning,
      dot: DairyColors.warning,
    };
  }
  if (status === "REJECT") {
    return {
      background: DairyColors.dangerSoft,
      text: DairyColors.danger,
      dot: DairyColors.danger,
    };
  }
  return {
    background: DairyColors.infoSoft,
    text: DairyColors.info,
    dot: DairyColors.info,
  };
}

function ProgressRow({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const normalized = Math.max(0, Math.min(1, value));

  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: DairyColors.textSecondary }}>{label}</Text>
        <Text style={{ fontWeight: "700", color: DairyColors.textPrimary }}>
          {percentage(normalized)}
        </Text>
      </View>
      <View
        style={{
          marginTop: 6,
          height: 8,
          borderRadius: 999,
          backgroundColor: DairyColors.backgroundAlt,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: "100%",
            width: `${normalized * 100}%`,
            borderRadius: 999,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
}

function ShiftCard({
  shift,
  totalLiters,
  qcStatus,
  accentBackground,
  statusLabel,
  shiftLabel,
  onPress,
}: {
  shift: "AM" | "PM";
  totalLiters: number;
  qcStatus?: QcStatus;
  accentBackground: string;
  statusLabel: (status?: QcStatus) => string;
  shiftLabel: (shift: "AM" | "PM") => string;
  onPress: () => void;
}) {
  const tone = getStatusTone(qcStatus);

  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: DairyColors.border,
        backgroundColor: DairyColors.surface,
        padding: 12,
      }}
    >
      <View
        style={{
          alignSelf: "flex-start",
          backgroundColor: accentBackground,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 999,
        }}
      >
        <Text style={{ fontWeight: "700", color: DairyColors.textPrimary }}>
          {shiftLabel(shift)}
        </Text>
      </View>
      <Text
        style={{
          marginTop: 10,
          fontSize: 20,
          fontWeight: "700",
          color: DairyColors.textPrimary,
        }}
      >
        {liters(totalLiters)}
      </Text>
      <View
        style={{
          marginTop: 10,
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: tone.background,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          gap: 6,
        }}
      >
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 8,
            backgroundColor: tone.dot,
          }}
        />
        <Text style={{ fontWeight: "700", color: tone.text }}>{statusLabel(qcStatus)}</Text>
        <Ionicons name="chevron-forward" size={14} color={tone.text} />
      </View>
    </Pressable>
  );
}

function WeeklyTrendRow({
  point,
  maxLiters,
  passLabel,
}: {
  point: WeeklyTrendPointResponse;
  maxLiters: number;
  passLabel: string;
}) {
  const widthPct = maxLiters > 0 ? Math.max(6, (point.totalLiters / maxLiters) * 100) : 6;
  const qcColor =
    point.passRate >= 0.75
      ? DairyColors.success
      : point.passRate >= 0.4
        ? DairyColors.warning
        : DairyColors.danger;

  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{shortWeekLabel(point.date)}</Text>
        <Text style={{ color: DairyColors.textSecondary }}>
          {liters(point.totalLiters)} | {passLabel} {percentage(point.passRate)}
        </Text>
      </View>
      <View
        style={{
          marginTop: 6,
          height: 10,
          borderRadius: 999,
          backgroundColor: DairyColors.backgroundAlt,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: "100%",
            width: `${widthPct}%`,
            borderRadius: 999,
            backgroundColor: qcColor,
          }}
        />
      </View>
    </View>
  );
}

function PendingCustomerCard({
  row,
  pendingLabel,
  transactionLabel,
  onPress,
}: {
  row: CustomerLedgerRowResponse;
  pendingLabel: string;
  transactionLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        marginTop: 8,
        borderRadius: 10,
        backgroundColor: DairyColors.warningSoft,
        padding: 10,
      }}
    >
      <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
        {row.customerName}
      </Text>
      <Text style={{ marginTop: 3, color: DairyColors.warning }}>
        {pendingLabel} {money(row.totalPending)} | {transactionLabel} {row.totalTransactions}
      </Text>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { x } = useI18n();

  const role = user?.role ?? null;
  const isAdmin = role === "ADMIN";
  const isManager = role === "MANAGER";
  const isWorker = role === "WORKER";
  const isVet = role === "VET";
  const isDelivery = role === "DELIVERY";
  const isFeedManager = role === "FEED_MANAGER";
  const isOpsDashboard = isAdmin || isManager || isWorker;
  const canViewFinance = isAdmin;
  const [date] = useState<string>(todayLocalISO());
  const [am, setAm] = useState<MilkBatchResponse | null>(null);
  const [pm, setPm] = useState<MilkBatchResponse | null>(null);
  const [report, setReport] = useState<DailyReportResponse | null>(null);
  const [weeklyTrend, setWeeklyTrend] = useState<WeeklyTrendResponse | null>(null);
  const [deliveryRows, setDeliveryRows] = useState<DeliveryChecklistItemResponse[]>([]);
  const [feedSummary, setFeedSummary] = useState<FeedManagementSummaryResponse | null>(null);
  const [salesSummary, setSalesSummary] = useState<SalesSummaryResponse | null>(null);
  const [expenseSummary, setExpenseSummary] = useState<ExpensesSummaryResponse | null>(null);
  const [healthSummary, setHealthSummary] = useState<HealthSummaryResponse | null>(null);
  const [pendingLedgerRows, setPendingLedgerRows] = useState<CustomerLedgerRowResponse[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      if (isVet) {
        const healthSummaryRes = await HealthApi.summary(date, 7);
        setHealthSummary(healthSummaryRes);
        setAm(null);
        setPm(null);
        setReport(null);
        setWeeklyTrend(null);
        setDeliveryRows([]);
        setFeedSummary(null);
        setSalesSummary(null);
        setExpenseSummary(null);
        setPendingLedgerRows([]);
        return;
      }

      if (isDelivery) {
        const rows = await SalesApi.deliveryList(date);
        setDeliveryRows(rows);
        setAm(null);
        setPm(null);
        setReport(null);
        setWeeklyTrend(null);
        setFeedSummary(null);
        setSalesSummary(null);
        setExpenseSummary(null);
        setPendingLedgerRows([]);
        setHealthSummary(null);
        return;
      }

      if (isFeedManager) {
        const summaryRes = await FeedManagementApi.summary(date);
        setFeedSummary(summaryRes);
        setAm(null);
        setPm(null);
        setReport(null);
        setWeeklyTrend(null);
        setDeliveryRows([]);
        setSalesSummary(null);
        setExpenseSummary(null);
        setPendingLedgerRows([]);
        setHealthSummary(null);
        return;
      }

      const fromDate = shiftIsoDate(date, -30);
      const [amRes, pmRes, reportRes, weeklyRes, healthSummaryRes] = await Promise.all([
        MilkApi.getBatch(date, "AM"),
        MilkApi.getBatch(date, "PM"),
        ReportApi.daily(date),
        ReportApi.weekly(date, 7),
        HealthApi.summary(date, 7),
      ]);

      let salesSummaryRes: SalesSummaryResponse | null = null;
      let expenseSummaryRes: ExpensesSummaryResponse | null = null;
      let ledgerRes: CustomerLedgerRowResponse[] = [];
      if (canViewFinance) {
        const [salesSummaryData, expenseSummaryData, ledgerData] = await Promise.all([
          SalesApi.summary(date),
          ExpenseApi.summary(date),
          SalesApi.ledger(fromDate, date),
        ]);
        salesSummaryRes = salesSummaryData;
        expenseSummaryRes = expenseSummaryData;
        ledgerRes = ledgerData;
      }
      setAm(amRes);
      setPm(pmRes);
      setReport(reportRes);
      setWeeklyTrend(weeklyRes);
      setDeliveryRows([]);
      setFeedSummary(null);
      setSalesSummary(salesSummaryRes);
      setExpenseSummary(expenseSummaryRes);
      setPendingLedgerRows(ledgerRes);
      setHealthSummary(healthSummaryRes);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Dashboard load failed", "डैशबोर्ड लोड नहीं हुआ"),
        e?.message ?? x("Could not load dashboard data", "डैशबोर्ड डेटा लोड नहीं हो पाया")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, role, canViewFinance]);

  const total = useMemo(() => (am?.totalLiters ?? 0) + (pm?.totalLiters ?? 0), [am, pm]);

  const totalBatchDecisions =
    (report?.passBatches ?? 0) +
    (report?.holdBatches ?? 0) +
    (report?.rejectBatches ?? 0);
  const passRate =
    totalBatchDecisions > 0 ? (report?.passBatches ?? 0) / totalBatchDecisions : 0;

  const totalCowQcCount = (report?.cowsQcDone ?? 0) + (report?.cowsQcPending ?? 0);
  const cowQcCoverage = totalCowQcCount > 0 ? (report?.cowsQcDone ?? 0) / totalCowQcCount : 0;

  const collectionRate =
    (salesSummary?.totalRevenue ?? 0) > 0
      ? (salesSummary?.totalReceived ?? 0) / (salesSummary?.totalRevenue ?? 0)
      : 0;
  const totalExpense = expenseSummary?.totalAmount ?? 0;
  const netProfit = (salesSummary?.totalRevenue ?? 0) - totalExpense;
  const profitMargin =
    (salesSummary?.totalRevenue ?? 0) > 0
      ? netProfit / (salesSummary?.totalRevenue ?? 0)
      : 0;

  const weeklyPoints = useMemo(() => weeklyTrend?.points ?? [], [weeklyTrend]);
  const maxWeeklyLiters = useMemo(() => {
    const max = weeklyPoints.reduce((m, p) => Math.max(m, p.totalLiters), 0);
    return max <= 0 ? 1 : max;
  }, [weeklyPoints]);

  const pendingCustomers = useMemo(
    () =>
      pendingLedgerRows
        .filter((row) => row.totalPending > 0)
        .sort((a, b) => b.totalPending - a.totalPending)
        .slice(0, 3),
    [pendingLedgerRows]
  );

  const deliverySummary = useMemo(() => {
    const totalStops = deliveryRows.length;
    const deliveredStops = deliveryRows.filter((row) => row.delivered).length;
    const pendingStops = totalStops - deliveredStops;
    const totalAmount = deliveryRows.reduce((sum, row) => sum + row.totalAmount, 0);
    const totalReceived = deliveryRows.reduce((sum, row) => sum + row.receivedAmount, 0);
    const totalPending = deliveryRows.reduce((sum, row) => sum + row.pendingAmount, 0);
    return {
      totalStops,
      deliveredStops,
      pendingStops,
      totalAmount,
      totalReceived,
      totalPending,
    };
  }, [deliveryRows]);

  const roleTitle = useMemo(() => {
    if (isAdmin) return x("Admin Dashboard", "एडमिन डैशबोर्ड");
    if (isManager) return x("Manager Dashboard", "मैनेजर डैशबोर्ड");
    if (isWorker) return x("Worker Dashboard", "वर्कर डैशबोर्ड");
    if (isVet) return x("Vet Dashboard", "वेट डैशबोर्ड");
    if (isDelivery) return x("Delivery Dashboard", "डिलीवरी डैशबोर्ड");
    if (isFeedManager) return x("Feed Manager Dashboard", "फीड मैनेजर डैशबोर्ड");
    return x("Dashboard", "डैशबोर्ड");
  }, [isAdmin, isDelivery, isFeedManager, isManager, isVet, isWorker, x]);

  const roleSubtitle = useMemo(() => {
    if (isAdmin) return x("Finance + operations + exception alerts", "वित्त + ऑपरेशन + अपवाद अलर्ट");
    if (isManager) return x("Daily production, QC and team operations", "दैनिक उत्पादन, QC और टीम ऑपरेशन");
    if (isWorker) return x("Shift execution and pending farm actions", "शिफ्ट काम और लंबित फार्म कार्य");
    if (isVet) return x("Vaccination, deworming and treatment priorities", "टीका, पेट दवा और ट्रीटमेंट प्राथमिकताएं");
    if (isDelivery) return x("Today delivery completion and collection status", "आज की डिलीवरी और वसूली स्थिति");
    if (isFeedManager) return x("Feed stock, recipes and checklist execution", "फीड स्टॉक, रेसिपी और चेकलिस्ट निष्पादन");
    return x("Daily farm status", "दैनिक फार्म स्थिति");
  }, [isAdmin, isDelivery, isFeedManager, isManager, isVet, isWorker, x]);

  const quickActions = useMemo<QuickAction[]>(() => {
    if (isVet) {
      return [
        { key: "health", label: x("Animal Health", "एनिमल हेल्थ"), href: "/health" },
        { key: "treatments", label: x("Treatments", "ट्रीटमेंट"), href: "/treatments" },
        { key: "breeding", label: x("Breeding", "ब्रीडिंग"), href: "/breeding" },
      ];
    }
    if (isDelivery) {
      return [
        { key: "delivery", label: x("Delivery Board", "डिलीवरी बोर्ड"), href: "/delivery-ops" },
        { key: "services", label: x("Services", "सर्विसेस"), href: "/services" },
      ];
    }
    if (isFeedManager) {
      return [
        { key: "feed", label: x("Feed", "फीड"), href: "/feed" },
        { key: "tasks", label: x("Tasks & Worklist", "टास्क और वर्कलिस्ट"), href: "/today-tasks" },
        { key: "stock", label: x("Stock", "स्टॉक"), href: "/stock" },
      ];
    }
    if (isWorker) {
      return [
        { key: "milk", label: x("Milk Entry", "दूध एंट्री"), href: "/milk" },
        { key: "todayTasks", label: x("Today Tasks", "आज के टास्क"), href: "/today-tasks" },
        { key: "feed", label: x("Feed", "फीड"), href: "/feed" },
      ];
    }
    if (isManager) {
      return [
        { key: "milk", label: x("Milk Entry", "दूध एंट्री"), href: "/milk" },
        { key: "qc", label: x("QC", "QC"), href: "/qc" },
        { key: "tasks", label: x("Today Tasks", "आज के टास्क"), href: "/today-tasks" },
      ];
    }
    return [
      { key: "milk", label: x("Milk Entry", "दूध एंट्री"), href: "/milk" },
      { key: "qc", label: x("QC", "QC"), href: "/qc" },
      { key: "services", label: x("Services", "सर्विसेस"), href: "/services" },
    ];
  }, [isDelivery, isFeedManager, isManager, isVet, isWorker, x]);

  const statusLabel = (status?: QcStatus) => {
    if (status === "PASS") {
      return x("PASS", "पास");
    }
    if (status === "HOLD") {
      return x("HOLD", "होल्ड");
    }
    if (status === "REJECT") {
      return x("REJECT", "रिजेक्ट");
    }
    return x("NO BATCH", "बैच नहीं");
  };

  const shiftLabel = (shift: "AM" | "PM") =>
    shift === "AM" ? x("AM SHIFT", "सुबह शिफ्ट") : x("PM SHIFT", "शाम शिफ्ट");

  const alerts = useMemo(() => {
    const next: string[] = [];
    if (isDelivery) {
      if (deliverySummary.pendingStops > 0) {
        next.push(
          x(
            `Pending deliveries: ${deliverySummary.pendingStops}`,
            `बाकी डिलीवरी: ${deliverySummary.pendingStops}`
          )
        );
      }
      if (deliverySummary.totalPending > 0) {
        next.push(
          x(
            `Collection pending: ${money(deliverySummary.totalPending)}`,
            `बाकी वसूली: ${money(deliverySummary.totalPending)}`
          )
        );
      }
      return next;
    }
    if (isFeedManager) {
      if ((feedSummary?.lowStockMaterials ?? 0) > 0) {
        next.push(
          x(
            `Low stock materials: ${feedSummary?.lowStockMaterials ?? 0}`,
            `कम स्टॉक सामग्री: ${feedSummary?.lowStockMaterials ?? 0}`
          )
        );
      }
      if ((feedSummary?.openTasks ?? 0) > 0) {
        next.push(
          x(`Open feed tasks: ${feedSummary?.openTasks ?? 0}`, `खुले फीड टास्क: ${feedSummary?.openTasks ?? 0}`)
        );
      }
      return next;
    }
    if (isVet) {
      if ((healthSummary?.vaccinationsOverdue ?? 0) > 0) {
        next.push(
          x(
            `Vaccinations overdue: ${healthSummary?.vaccinationsOverdue ?? 0}`,
            `टीका समय से बाकी: ${healthSummary?.vaccinationsOverdue ?? 0}`
          )
        );
      }
      if ((healthSummary?.dewormingOverdue ?? 0) > 0) {
        next.push(
          x(
            `Deworming overdue: ${healthSummary?.dewormingOverdue ?? 0}`,
            `पेट की दवा समय से बाकी: ${healthSummary?.dewormingOverdue ?? 0}`
          )
        );
      }
      return next;
    }
    if ((report?.holdBatches ?? 0) > 0) {
      next.push(
        x(`${report?.holdBatches ?? 0} batch is on HOLD`, `${report?.holdBatches ?? 0} बैच होल्ड पर है`)
      );
    }
    if ((report?.rejectBatches ?? 0) > 0) {
      next.push(
        x(`${report?.rejectBatches ?? 0} batch is REJECTED`, `${report?.rejectBatches ?? 0} बैच रिजेक्ट है`)
      );
    }
    if ((report?.cowsQcPending ?? 0) > 0) {
      next.push(
        x(`${report?.cowsQcPending ?? 0} cows still pending QC`, `${report?.cowsQcPending ?? 0} गायों का QC बाकी है`)
      );
    }
    if ((salesSummary?.totalPending ?? 0) > 0) {
      next.push(
        x(
          `Payments pending today: ${money(salesSummary?.totalPending ?? 0)}`,
          `आज का बाकी भुगतान: ${money(salesSummary?.totalPending ?? 0)}`
        )
      );
    }
    if (canViewFinance && netProfit < 0) {
      next.push(
        x(
          `Today's profit is negative: ${money(netProfit)}`,
          `आज का मुनाफा नेगेटिव है: ${money(netProfit)}`
        )
      );
    }
    if ((healthSummary?.vaccinationsOverdue ?? 0) > 0) {
      next.push(
        x(
          `Vaccinations overdue: ${healthSummary?.vaccinationsOverdue ?? 0}`,
          `टीका समय से बाकी: ${healthSummary?.vaccinationsOverdue ?? 0}`
        )
      );
    }
    if ((healthSummary?.dewormingOverdue ?? 0) > 0) {
      next.push(
        x(
          `Deworming overdue: ${healthSummary?.dewormingOverdue ?? 0}`,
          `पेट की दवा समय से बाकी: ${healthSummary?.dewormingOverdue ?? 0}`
        )
      );
    }
    return next;
  }, [
    canViewFinance,
    deliverySummary.pendingStops,
    deliverySummary.totalPending,
    feedSummary?.lowStockMaterials,
    feedSummary?.openTasks,
    healthSummary,
    isDelivery,
    isFeedManager,
    isVet,
    netProfit,
    report,
    salesSummary,
    x,
  ]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: DairyColors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View>
          <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
            NANI Dairy
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x(`Farm snapshot for ${date}`, `${date} का फार्म सारांश`)}
          </Text>
        </View>

        <Pressable
          onPress={load}
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
          marginTop: 14,
          backgroundColor: DairyColors.surface,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: DairyColors.border,
          padding: 14,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "700", color: DairyColors.textPrimary }}>
          {roleTitle}
        </Text>
        <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>{roleSubtitle}</Text>
        <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {quickActions.map((action) => (
            <Pressable
              key={action.key}
              onPress={() => router.push(action.href)}
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: DairyColors.border,
                backgroundColor: DairyColors.surfaceMuted,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {isOpsDashboard ? (
        <>
          <View
            style={{
              marginTop: 14,
              borderRadius: 16,
              backgroundColor: DairyColors.primary,
              padding: 16,
            }}
          >
            <Text style={{ color: "#DDF0E5", fontWeight: "600" }}>
              {x("TODAY TOTAL PRODUCTION", "आज का कुल उत्पादन")}
            </Text>
            <Text style={{ marginTop: 6, fontSize: 34, fontWeight: "800", color: "white" }}>
              {liters(total)}
            </Text>
            <View style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
              <View
                style={{
                  borderRadius: 999,
                  backgroundColor: DairyColors.morningSoft,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                  {x(`AM ${liters(am?.totalLiters ?? 0)}`, `सुबह ${liters(am?.totalLiters ?? 0)}`)}
                </Text>
              </View>
              <View
                style={{
                  borderRadius: 999,
                  backgroundColor: DairyColors.eveningSoft,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                  {x(`PM ${liters(pm?.totalLiters ?? 0)}`, `शाम ${liters(pm?.totalLiters ?? 0)}`)}
                </Text>
              </View>
            </View>
          </View>

          <View style={{ marginTop: 14, flexDirection: "row", gap: 10 }}>
            <ShiftCard
              shift="AM"
              totalLiters={am?.totalLiters ?? 0}
              qcStatus={am?.qcStatus}
              accentBackground={DairyColors.morningSoft}
              statusLabel={statusLabel}
              shiftLabel={shiftLabel}
              onPress={() => router.push({ pathname: "/qc", params: { date, shift: "AM" } })}
            />
            <ShiftCard
              shift="PM"
              totalLiters={pm?.totalLiters ?? 0}
              qcStatus={pm?.qcStatus}
              accentBackground={DairyColors.eveningSoft}
              statusLabel={statusLabel}
              shiftLabel={shiftLabel}
              onPress={() => router.push({ pathname: "/qc", params: { date, shift: "PM" } })}
            />
          </View>
        </>
      ) : null}

      {isOpsDashboard && !isWorker ? (
        <View
          style={{
            marginTop: 14,
            backgroundColor: DairyColors.surface,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: DairyColors.border,
            padding: 14,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: DairyColors.textPrimary }}>
            {x("7-Day Production & QC Trend", "7 दिन का उत्पादन और QC ट्रेंड")}
          </Text>
          {weeklyPoints.length === 0 ? (
            <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
              {x("No weekly data available.", "साप्ताहिक डेटा उपलब्ध नहीं है।")}
            </Text>
          ) : (
            weeklyPoints.map((point) => (
              <WeeklyTrendRow
                key={point.date}
                point={point}
                maxLiters={maxWeeklyLiters}
                passLabel={x("PASS", "पास")}
              />
            ))
          )}
        </View>
      ) : null}

      {isOpsDashboard ? (
        <View
          style={{
            marginTop: 14,
            backgroundColor: DairyColors.surface,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: DairyColors.border,
            padding: 14,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: DairyColors.textPrimary }}>
            {x("Quality Insights", "क्वालिटी जानकारी")}
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x(
              `PASS ${report?.passBatches ?? 0} • HOLD ${report?.holdBatches ?? 0} • REJECT ${report?.rejectBatches ?? 0}`,
              `पास ${report?.passBatches ?? 0} • होल्ड ${report?.holdBatches ?? 0} • रिजेक्ट ${report?.rejectBatches ?? 0}`
            )}
          </Text>

          <ProgressRow label={x("Batch pass rate", "बैच पास दर")} value={passRate} color={DairyColors.success} />
          <ProgressRow label={x("Per-cow QC coverage", "प्रति गाय QC कवरेज")} value={cowQcCoverage} color={DairyColors.info} />
        </View>
      ) : null}

      {canViewFinance ? (
        <View
          style={{
            marginTop: 14,
            backgroundColor: DairyColors.surface,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: DairyColors.border,
            padding: 14,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: DairyColors.textPrimary }}>
            {x("Revenue Snapshot", "आय का सारांश")}
          </Text>
          <>
            <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Pressable
                onPress={() => router.push("/sales")}
                style={{
                  flex: 1,
                  minWidth: 130,
                  borderRadius: 12,
                  backgroundColor: DairyColors.accentSoft,
                  padding: 10,
                }}
              >
                <Text style={{ color: DairyColors.textSecondary }}>{x("Revenue", "कुल आय")}</Text>
                <Text style={{ marginTop: 4, fontWeight: "800", color: DairyColors.textPrimary }}>
                  {money(salesSummary?.totalRevenue ?? 0)}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push("/sales")}
                style={{
                  flex: 1,
                  minWidth: 130,
                  borderRadius: 12,
                  backgroundColor: DairyColors.successSoft,
                  padding: 10,
                }}
              >
                <Text style={{ color: DairyColors.textSecondary }}>{x("Received", "मिला भुगतान")}</Text>
                <Text style={{ marginTop: 4, fontWeight: "800", color: DairyColors.textPrimary }}>
                  {money(salesSummary?.totalReceived ?? 0)}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push("/sales")}
                style={{
                  flex: 1,
                  minWidth: 130,
                  borderRadius: 12,
                  backgroundColor: DairyColors.warningSoft,
                  padding: 10,
                }}
              >
                <Text style={{ color: DairyColors.textSecondary }}>{x("Pending", "बाकी")}</Text>
                <Text style={{ marginTop: 4, fontWeight: "800", color: DairyColors.textPrimary }}>
                  {money(salesSummary?.totalPending ?? 0)}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push("/sales")}
                style={{
                  flex: 1,
                  minWidth: 130,
                  borderRadius: 12,
                  backgroundColor: DairyColors.infoSoft,
                  padding: 10,
                }}
              >
                <Text style={{ color: DairyColors.textSecondary }}>{x("Transactions", "लेनदेन")}</Text>
                <Text style={{ marginTop: 4, fontWeight: "800", color: DairyColors.textPrimary }}>
                  {salesSummary?.totalTransactions ?? 0}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push("/expenses")}
                style={{
                  flex: 1,
                  minWidth: 130,
                  borderRadius: 12,
                  backgroundColor: DairyColors.dangerSoft,
                  padding: 10,
                }}
              >
                <Text style={{ color: DairyColors.textSecondary }}>{x("Expense", "कुल खर्च")}</Text>
                <Text style={{ marginTop: 4, fontWeight: "800", color: DairyColors.textPrimary }}>
                  {money(totalExpense)}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push("/sales")}
                style={{
                  flex: 1,
                  minWidth: 130,
                  borderRadius: 12,
                  backgroundColor: netProfit >= 0 ? DairyColors.successSoft : DairyColors.dangerSoft,
                  padding: 10,
                }}
              >
                <Text style={{ color: DairyColors.textSecondary }}>{x("Net Profit", "शुद्ध मुनाफा")}</Text>
                <Text style={{ marginTop: 4, fontWeight: "800", color: DairyColors.textPrimary }}>
                  {money(netProfit)}
                </Text>
              </Pressable>
            </View>

            <ProgressRow label={x("Collection efficiency", "वसूली दक्षता")} value={collectionRate} color={DairyColors.success} />
            <ProgressRow
              label={x("Profit margin", "मुनाफा मार्जिन")}
              value={Math.max(0, profitMargin)}
              color={netProfit >= 0 ? DairyColors.success : DairyColors.danger}
            />
          </>
        </View>
      ) : null}

      {isDelivery ? (
        <View
          style={{
            marginTop: 14,
            backgroundColor: DairyColors.surface,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: DairyColors.border,
            padding: 14,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: DairyColors.textPrimary }}>
            {x("Delivery Progress", "डिलीवरी प्रगति")}
          </Text>
          <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Pressable
              onPress={() => router.push("/delivery-ops")}
              style={{ flex: 1, minWidth: 120, borderRadius: 12, backgroundColor: DairyColors.infoSoft, padding: 10 }}
            >
              <Text style={{ color: DairyColors.textSecondary }}>{x("Total Stops", "कुल स्टॉप")}</Text>
              <Text style={{ marginTop: 4, fontWeight: "800", color: DairyColors.textPrimary }}>
                {deliverySummary.totalStops}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/delivery-ops")}
              style={{ flex: 1, minWidth: 120, borderRadius: 12, backgroundColor: DairyColors.successSoft, padding: 10 }}
            >
              <Text style={{ color: DairyColors.textSecondary }}>{x("Delivered", "डिलीवर")}</Text>
              <Text style={{ marginTop: 4, fontWeight: "800", color: DairyColors.textPrimary }}>
                {deliverySummary.deliveredStops}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/delivery-ops")}
              style={{ flex: 1, minWidth: 120, borderRadius: 12, backgroundColor: DairyColors.warningSoft, padding: 10 }}
            >
              <Text style={{ color: DairyColors.textSecondary }}>{x("Pending", "बाकी")}</Text>
              <Text style={{ marginTop: 4, fontWeight: "800", color: DairyColors.textPrimary }}>
                {deliverySummary.pendingStops}
              </Text>
            </Pressable>
          </View>
          <Text style={{ marginTop: 10, color: DairyColors.textSecondary }}>
            {x(
              `Collected ${money(deliverySummary.totalReceived)} | Pending ${money(deliverySummary.totalPending)} | Total ${money(deliverySummary.totalAmount)}`,
              `वसूली ${money(deliverySummary.totalReceived)} | बाकी ${money(deliverySummary.totalPending)} | कुल ${money(deliverySummary.totalAmount)}`
            )}
          </Text>
        </View>
      ) : null}

      {isFeedManager ? (
        <View
          style={{
            marginTop: 14,
            backgroundColor: DairyColors.surface,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: DairyColors.border,
            padding: 14,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: DairyColors.textPrimary }}>
            {x("Feed Operations", "फीड ऑपरेशन")}
          </Text>
          <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Pressable
              onPress={() => router.push("/feed")}
              style={{ flex: 1, minWidth: 120, borderRadius: 12, backgroundColor: DairyColors.infoSoft, padding: 10 }}
            >
              <Text style={{ color: DairyColors.textSecondary }}>{x("Materials", "सामग्री")}</Text>
              <Text style={{ marginTop: 4, fontWeight: "800", color: DairyColors.textPrimary }}>
                {feedSummary?.totalMaterials ?? 0}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/stock")}
              style={{ flex: 1, minWidth: 120, borderRadius: 12, backgroundColor: DairyColors.warningSoft, padding: 10 }}
            >
              <Text style={{ color: DairyColors.textSecondary }}>{x("Low Stock", "कम स्टॉक")}</Text>
              <Text style={{ marginTop: 4, fontWeight: "800", color: DairyColors.textPrimary }}>
                {feedSummary?.lowStockMaterials ?? 0}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/feed")}
              style={{ flex: 1, minWidth: 120, borderRadius: 12, backgroundColor: DairyColors.accentSoft, padding: 10 }}
            >
              <Text style={{ color: DairyColors.textSecondary }}>{x("Open Tasks", "खुले टास्क")}</Text>
              <Text style={{ marginTop: 4, fontWeight: "800", color: DairyColors.textPrimary }}>
                {feedSummary?.openTasks ?? 0}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/feed")}
              style={{ flex: 1, minWidth: 120, borderRadius: 12, backgroundColor: DairyColors.successSoft, padding: 10 }}
            >
              <Text style={{ color: DairyColors.textSecondary }}>{x("Done Today", "आज पूरे")}</Text>
              <Text style={{ marginTop: 4, fontWeight: "800", color: DairyColors.textPrimary }}>
                {feedSummary?.doneTasksToday ?? 0}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {isOpsDashboard || isVet ? (
        <View
          style={{
            marginTop: 14,
            backgroundColor: DairyColors.surface,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: DairyColors.border,
            padding: 14,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: DairyColors.textPrimary }}>
            {x("Animal Health Watch", "जानवर सेहत निगरानी")}
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x("Vaccination and deworming due tracking", "टीका और पेट की दवा की देय स्थिति")}
          </Text>
          <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Pressable
              onPress={() => router.push("/health")}
              style={{
                flex: 1,
                minWidth: 130,
                borderRadius: 12,
                backgroundColor: DairyColors.warningSoft,
                padding: 10,
              }}
            >
              <Text style={{ color: DairyColors.textSecondary }}>{x("Vaccines Today", "आज के टीके")}</Text>
              <Text style={{ marginTop: 4, fontWeight: "800", color: DairyColors.textPrimary }}>
                {healthSummary?.vaccinationsDueToday ?? 0}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/health")}
              style={{
                flex: 1,
                minWidth: 130,
                borderRadius: 12,
                backgroundColor: DairyColors.dangerSoft,
                padding: 10,
              }}
            >
              <Text style={{ color: DairyColors.textSecondary }}>{x("Vaccines Overdue", "बाकी टीके")}</Text>
              <Text style={{ marginTop: 4, fontWeight: "800", color: DairyColors.textPrimary }}>
                {healthSummary?.vaccinationsOverdue ?? 0}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/health")}
              style={{
                flex: 1,
                minWidth: 130,
                borderRadius: 12,
                backgroundColor: DairyColors.infoSoft,
                padding: 10,
              }}
            >
              <Text style={{ color: DairyColors.textSecondary }}>{x("Deworming Today", "आज की पेट दवा")}</Text>
              <Text style={{ marginTop: 4, fontWeight: "800", color: DairyColors.textPrimary }}>
                {healthSummary?.dewormingDueToday ?? 0}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/health")}
              style={{
                flex: 1,
                minWidth: 130,
                borderRadius: 12,
                backgroundColor: DairyColors.dangerSoft,
                padding: 10,
              }}
            >
              <Text style={{ color: DairyColors.textSecondary }}>{x("Deworming Overdue", "बाकी पेट दवा")}</Text>
              <Text style={{ marginTop: 4, fontWeight: "800", color: DairyColors.textPrimary }}>
                {healthSummary?.dewormingOverdue ?? 0}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {canViewFinance ? (
        <View
          style={{
            marginTop: 14,
            backgroundColor: DairyColors.surface,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: DairyColors.border,
            padding: 14,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: DairyColors.textPrimary }}>
            {x("Pending Collection Alerts", "बाकी वसूली अलर्ट")}
          </Text>
          {pendingCustomers.length === 0 ? (
            <Text style={{ marginTop: 8, color: DairyColors.success }}>
              {x("No pending collection in last 30 days.", "पिछले 30 दिनों में कोई बकाया वसूली नहीं है।")}
            </Text>
          ) : (
            pendingCustomers.map((row) => (
              <PendingCustomerCard
                key={`${row.customerType}__${row.customerName}`}
                row={row}
                pendingLabel={x("Pending", "बाकी")}
                transactionLabel={x("Transactions", "लेनदेन")}
                onPress={() => router.push("/sales")}
              />
            ))
          )}
        </View>
      ) : null}

      <View
        style={{
          marginTop: 14,
          backgroundColor: DairyColors.surface,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: DairyColors.border,
          padding: 14,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "700", color: DairyColors.textPrimary }}>
          {x("Operational Alerts", "ऑपरेशन अलर्ट")}
        </Text>
        {alerts.length === 0 ? (
          <Text style={{ marginTop: 8, color: DairyColors.success }}>
            {x("All clear for today.", "आज सब ठीक है।")}
          </Text>
        ) : (
          alerts.map((alertText) => (
            <View
              key={alertText}
              style={{
                marginTop: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                borderRadius: 10,
                backgroundColor: DairyColors.dangerSoft,
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}
            >
              <Ionicons name="alert-circle" size={16} color={DairyColors.danger} />
              <Text style={{ color: DairyColors.danger }}>{alertText}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
