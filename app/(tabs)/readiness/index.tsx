import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { DairyColors } from "@/src/constants/dairy-theme";
import { IntegrationApi, ReadinessApi } from "@/src/services/api";
import { useAuth } from "@/src/state/auth";
import { useI18n } from "@/src/state/i18n";
import { resolveRolePermissions } from "@/src/state/permissions";
import { getPendingSyncSummary } from "@/src/utils/offline-sync";

type ManualChecklistState = {
  backupDrillReviewed: boolean;
  securityChecklistReviewed: boolean;
  operatorSopShared: boolean;
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 120,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: DairyColors.border,
        backgroundColor: DairyColors.surface,
        padding: 12,
      }}
    >
      <Text style={{ color: DairyColors.textSecondary, fontWeight: "600" }}>{label}</Text>
      <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontSize: 20, fontWeight: "800" }}>{value}</Text>
    </View>
  );
}

function CheckRow({
  title,
  done,
  onToggle,
  detail,
}: {
  title: string;
  done: boolean;
  onToggle?: () => void;
  detail?: string;
}) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={!onToggle}
      style={{
        borderRadius: 12,
        borderWidth: 1,
        borderColor: done ? DairyColors.success : DairyColors.border,
        backgroundColor: done ? DairyColors.successSoft : DairyColors.surface,
        padding: 12,
        opacity: onToggle ? 1 : 0.96,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "700", flex: 1, paddingRight: 8 }}>{title}</Text>
        <Ionicons name={done ? "checkmark-circle" : "ellipse-outline"} size={20} color={done ? DairyColors.success : DairyColors.textSecondary} />
      </View>
      {detail?.trim() ? (
        <Text style={{ marginTop: 6, color: DairyColors.textSecondary }}>{detail}</Text>
      ) : null}
    </Pressable>
  );
}

export default function ReadinessScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { x } = useI18n();
  const permissions = resolveRolePermissions(user?.role);
  const canOpen = permissions.isAdmin || permissions.isManager;

  const [loading, setLoading] = useState(true);
  const [healthStatus, setHealthStatus] = useState<string>("-");
  const [syncTotal, setSyncTotal] = useState(0);
  const [syncDeadLetter, setSyncDeadLetter] = useState(0);
  const [syncConflict, setSyncConflict] = useState(0);
  const [integrationFailed24h, setIntegrationFailed24h] = useState(0);
  const [integrationTotal24h, setIntegrationTotal24h] = useState(0);
  const [manualChecks, setManualChecks] = useState<ManualChecklistState>({
    backupDrillReviewed: false,
    securityChecklistReviewed: false,
    operatorSopShared: false,
  });

  const load = useCallback(async () => {
    if (!canOpen) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [healthRes, syncRes, monitoringRes] = await Promise.all([
        ReadinessApi.health().catch(() => null),
        getPendingSyncSummary(),
        IntegrationApi.monitoring(24).catch(() => null),
      ]);
      setHealthStatus((healthRes?.status ?? "UNKNOWN").toUpperCase());
      setSyncTotal(syncRes.total ?? 0);
      setSyncDeadLetter(syncRes.deadLetter ?? 0);
      setSyncConflict(syncRes.conflict ?? 0);
      setIntegrationFailed24h(monitoringRes?.last24hFailedEvents ?? 0);
      setIntegrationTotal24h(monitoringRes?.last24hEvents ?? 0);
    } finally {
      setLoading(false);
    }
  }, [canOpen]);

  useEffect(() => {
    void load();
  }, [load]);

  const autoChecks = useMemo(
    () => ({
      backendUp: healthStatus === "UP",
      syncHealthy: syncDeadLetter === 0 && syncConflict === 0,
      integrationHealthy: integrationFailed24h === 0,
    }),
    [healthStatus, integrationFailed24h, syncConflict, syncDeadLetter]
  );

  if (!canOpen) {
    return (
      <View style={{ flex: 1, backgroundColor: DairyColors.background, padding: 16 }}>
        <Text style={{ color: DairyColors.textPrimary, fontSize: 24, fontWeight: "800" }}>
          {x("Release Readiness", "रिलीज़ रेडीनेस")}
        </Text>
        <View
          style={{
            marginTop: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: DairyColors.warning,
            backgroundColor: DairyColors.warningSoft,
            padding: 12,
          }}
        >
          <Text style={{ color: DairyColors.warning, fontWeight: "700" }}>
            {x("This screen is available only for ADMIN/MANAGER roles.", "यह स्क्रीन केवल ADMIN/MANAGER रोल के लिए उपलब्ध है।")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: DairyColors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View>
          <Text style={{ color: DairyColors.textPrimary, fontSize: 24, fontWeight: "800" }}>
            {x("Release Readiness", "रिलीज़ रेडीनेस")}
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x("Beta launch checklist, error hooks, and SOP visibility", "बीटा लॉन्च चेकलिस्ट, एरर हुक और SOP विजिबिलिटी")}
          </Text>
        </View>
        <Pressable
          onPress={() => void load()}
          disabled={loading}
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
          {loading ? (
            <ActivityIndicator size="small" color={DairyColors.primary} />
          ) : (
            <Ionicons name="refresh" size={20} color={DairyColors.primary} />
          )}
        </Pressable>
      </View>

      <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <StatCard label={x("Backend Health", "बैकएंड हेल्थ")} value={healthStatus} />
        <StatCard label={x("Sync Queue", "सिंक कतार")} value={syncTotal} />
        <StatCard label={x("Dead/Conflict", "डेड/कॉनफ्लिक्ट")} value={`${syncDeadLetter}/${syncConflict}`} />
        <StatCard label={x("Integration Failed 24h", "इंटीग्रेशन असफल 24h")} value={integrationFailed24h} />
      </View>

      <View style={{ marginTop: 14, gap: 10 }}>
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
          {x("Readiness Checklist", "रेडीनेस चेकलिस्ट")}
        </Text>

        <CheckRow
          title={x("Backend health endpoint is UP", "बैकएंड हेल्थ एंडपॉइंट UP है")}
          done={autoChecks.backendUp}
          detail={x("Source: /actuator/health", "स्रोत: /actuator/health")}
        />

        <CheckRow
          title={x("Offline sync queue has no dead-letter/conflict records", "ऑफलाइन सिंक कतार में डेड-लेटर/कॉनफ्लिक्ट नहीं है")}
          done={autoChecks.syncHealthy}
          detail={x(
            `Current queue ${syncTotal}, dead ${syncDeadLetter}, conflict ${syncConflict}`,
            `वर्तमान कतार ${syncTotal}, डेड ${syncDeadLetter}, कॉनफ्लिक्ट ${syncConflict}`
          )}
        />

        <CheckRow
          title={x("Integration ingest errors are under control", "इंटीग्रेशन इनजेस्ट त्रुटियां नियंत्रण में हैं")}
          done={autoChecks.integrationHealthy}
          detail={x(
            `Failed ${integrationFailed24h} out of ${integrationTotal24h} events in last 24h`,
            `पिछले 24h में ${integrationTotal24h} इवेंट में से ${integrationFailed24h} असफल`
          )}
        />

        <CheckRow
          title={x("Backup/restore drill reviewed with operators", "ऑपरेटर के साथ बैकअप/रीस्टोर ड्रिल की समीक्षा")}
          done={manualChecks.backupDrillReviewed}
          onToggle={() =>
            setManualChecks((prev) => ({ ...prev, backupDrillReviewed: !prev.backupDrillReviewed }))
          }
          detail={x("Manual confirmation", "मैनुअल पुष्टि")}
        />

        <CheckRow
          title={x("Security hardening checklist reviewed", "सिक्योरिटी हार्डनिंग चेकलिस्ट की समीक्षा")}
          done={manualChecks.securityChecklistReviewed}
          onToggle={() =>
            setManualChecks((prev) => ({
              ...prev,
              securityChecklistReviewed: !prev.securityChecklistReviewed,
            }))
          }
          detail={x("Manual confirmation", "मैनुअल पुष्टि")}
        />

        <CheckRow
          title={x("Recovery SOP shared with shift operators", "शिफ्ट ऑपरेटर के साथ रिकवरी SOP साझा किया गया")}
          done={manualChecks.operatorSopShared}
          onToggle={() =>
            setManualChecks((prev) => ({ ...prev, operatorSopShared: !prev.operatorSopShared }))
          }
          detail={x("Manual confirmation", "मैनुअल पुष्टि")}
        />
      </View>

      <View
        style={{
          marginTop: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: DairyColors.border,
          backgroundColor: DairyColors.surface,
          padding: 12,
          gap: 8,
        }}
      >
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
          {x("Backup & Recovery SOP (Operator View)", "बैकअप और रिकवरी SOP (ऑपरेटर व्यू)")}
        </Text>
        <Text style={{ color: DairyColors.textSecondary }}>
          {x("1. Stop backend service before file copy.", "1. फ़ाइल कॉपी से पहले बैकएंड सर्विस रोकें।")}
        </Text>
        <Text style={{ color: DairyColors.textSecondary }}>
          {x("2. Copy H2 DB files into dated backup folder.", "2. H2 DB फ़ाइलें तारीख वाले बैकअप फोल्डर में कॉपी करें।")}
        </Text>
        <Text style={{ color: DairyColors.textSecondary }}>
          {x("3. Restart backend and verify login + health endpoint.", "3. बैकएंड फिर चालू करें और लॉगिन + हेल्थ एंडपॉइंट जाँचें।")}
        </Text>
        <Text style={{ color: DairyColors.textSecondary }}>
          {x("4. Weekly restore drill: restore one backup and verify core modules.", "4. साप्ताहिक रीस्टोर ड्रिल: एक बैकअप रीस्टोर कर मुख्य मॉड्यूल जांचें।")}
        </Text>
      </View>

      <View style={{ marginTop: 14, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Pressable
          onPress={() => router.push("/sync")}
          style={{
            borderRadius: 10,
            borderWidth: 1,
            borderColor: DairyColors.border,
            backgroundColor: DairyColors.surface,
            paddingHorizontal: 12,
            paddingVertical: 9,
          }}
        >
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
            {x("Open Sync Center", "सिंक सेंटर खोलें")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/integrations")}
          style={{
            borderRadius: 10,
            borderWidth: 1,
            borderColor: DairyColors.border,
            backgroundColor: DairyColors.surface,
            paddingHorizontal: 12,
            paddingVertical: 9,
          }}
        >
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
            {x("Open Integration Ops", "इंटीग्रेशन ऑप्स खोलें")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/governance")}
          style={{
            borderRadius: 10,
            borderWidth: 1,
            borderColor: DairyColors.border,
            backgroundColor: DairyColors.surface,
            paddingHorizontal: 12,
            paddingVertical: 9,
          }}
        >
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
            {x("Open Governance", "गवर्नेंस खोलें")}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
