import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { DairyColors } from "../constants/dairy-theme";
import {
  CustomerLedgerRowResponse,
  DailyReportResponse,
  ExpenseApi,
  ExpensesSummaryResponse,
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
} from "../services/api";
import { shiftIsoDate, shortWeekLabel, todayLocalISO } from "../utils/date";
import { useI18n } from "../state/i18n";
import { useAuth } from "../state/auth";

type StatusTone = {
  background: string;
  text: string;
  dot: string;
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
}: {
  shift: "AM" | "PM";
  totalLiters: number;
  qcStatus?: QcStatus;
  accentBackground: string;
  statusLabel: (status?: QcStatus) => string;
  shiftLabel: (shift: "AM" | "PM") => string;
}) {
  const tone = getStatusTone(qcStatus);

  return (
    <View
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
      </View>
    </View>
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
}: {
  row: CustomerLedgerRowResponse;
  pendingLabel: string;
  transactionLabel: string;
}) {
  return (
    <View
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
    </View>
  );
}

export default function DashboardScreen() {
  const { hasAnyRole, user } = useAuth();
  const { x } = useI18n();

  const canViewFinance = hasAnyRole("ADMIN");
  const [date] = useState<string>(todayLocalISO());
  const [am, setAm] = useState<MilkBatchResponse | null>(null);
  const [pm, setPm] = useState<MilkBatchResponse | null>(null);
  const [report, setReport] = useState<DailyReportResponse | null>(null);
  const [weeklyTrend, setWeeklyTrend] = useState<WeeklyTrendResponse | null>(null);
  const [salesSummary, setSalesSummary] = useState<SalesSummaryResponse | null>(null);
  const [expenseSummary, setExpenseSummary] = useState<ExpensesSummaryResponse | null>(null);
  const [healthSummary, setHealthSummary] = useState<HealthSummaryResponse | null>(null);
  const [pendingLedgerRows, setPendingLedgerRows] = useState<CustomerLedgerRowResponse[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
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
  }, [date, canViewFinance]);

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
  }, [report, salesSummary, healthSummary, canViewFinance, netProfit, x]);

  if (user?.role === "VET") {
    return <Redirect href="/health" />;
  }
  if (user?.role === "DELIVERY") {
    return <Redirect href="/sales" />;
  }
  if (user?.role === "FEED_MANAGER") {
    return <Redirect href="/feed" />;
  }

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
        />
        <ShiftCard
          shift="PM"
          totalLiters={pm?.totalLiters ?? 0}
          qcStatus={pm?.qcStatus}
          accentBackground={DairyColors.eveningSoft}
          statusLabel={statusLabel}
          shiftLabel={shiftLabel}
        />
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
              <View
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
              </View>

              <View
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
              </View>

              <View
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
              </View>

              <View
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
              </View>

              <View
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
              </View>

              <View
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
              </View>
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
          <View
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
          </View>
          <View
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
          </View>
          <View
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
          </View>
          <View
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
          </View>
        </View>
      </View>

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
