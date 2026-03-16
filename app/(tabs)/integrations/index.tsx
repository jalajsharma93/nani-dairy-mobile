import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { DairyColors } from "@/src/constants/dairy-theme";
import {
  CreateIntegrationConnectorPayload,
  IntegrationApi,
  IntegrationConnectorResponse,
  IntegrationConnectorType,
  IntegrationEventResponse,
  IntegrationIngestStatus,
  IntegrationMonitoringResponse,
} from "@/src/services/api";
import { useAuth } from "@/src/state/auth";
import { useI18n } from "@/src/state/i18n";
import { resolveRolePermissions } from "@/src/state/permissions";

const CONNECTOR_TYPES: IntegrationConnectorType[] = [
  "RFID",
  "MILK_ANALYZER",
  "WEIGH_SCALE",
  "IOT_GATEWAY",
  "CUSTOM",
];

const EVENT_STATUS_OPTIONS: (IntegrationIngestStatus | "ALL")[] = [
  "ALL",
  "RECEIVED",
  "NORMALIZED",
  "FAILED",
];

function statusTone(status: string) {
  if (status === "ACTIVE" || status === "NORMALIZED") {
    return { bg: DairyColors.successSoft, text: DairyColors.success };
  }
  if (status === "FAILED" || status === "INACTIVE") {
    return { bg: DairyColors.dangerSoft, text: DairyColors.danger };
  }
  return { bg: DairyColors.warningSoft, text: DairyColors.warning };
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
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

export default function IntegrationsScreen() {
  const { user } = useAuth();
  const { x } = useI18n();
  const permissions = resolveRolePermissions(user?.role);
  const canView = permissions.isAdmin || permissions.isManager;
  const canManage = permissions.isAdmin;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [monitoring, setMonitoring] = useState<IntegrationMonitoringResponse | null>(null);
  const [connectors, setConnectors] = useState<IntegrationConnectorResponse[]>([]);
  const [events, setEvents] = useState<IntegrationEventResponse[]>([]);
  const [eventStatus, setEventStatus] = useState<IntegrationIngestStatus | "ALL">("ALL");

  const [name, setName] = useState("");
  const [connectorType, setConnectorType] = useState<IntegrationConnectorType>("CUSTOM");
  const [connectorKey, setConnectorKey] = useState("");
  const [allowedSource, setAllowedSource] = useState("");

  const connectorMetricsById = useMemo(() => {
    const map = new Map<string, NonNullable<IntegrationMonitoringResponse["connectors"]>[number]>();
    (monitoring?.connectors ?? []).forEach((row) => map.set(row.connectorId, row));
    return map;
  }, [monitoring]);

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [monitoringRes, connectorsRes, eventsRes] = await Promise.all([
        IntegrationApi.monitoring(24),
        IntegrationApi.connectors(),
        IntegrationApi.events({
          sinceHours: 72,
          limit: 80,
          status: eventStatus === "ALL" ? undefined : eventStatus,
        }),
      ]);
      setMonitoring(monitoringRes);
      setConnectors(connectorsRes);
      setEvents(eventsRes);
    } catch (e: any) {
      Alert.alert(
        x("Could not load integration dashboard", "इंटीग्रेशन डैशबोर्ड लोड नहीं हुआ"),
        e?.message ?? x("Please retry.", "कृपया फिर से कोशिश करें।")
      );
    } finally {
      setLoading(false);
    }
  }, [canView, eventStatus, x]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreateConnector = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert(x("Connector name required", "कनेक्टर नाम जरूरी"));
      return;
    }
    const payload: CreateIntegrationConnectorPayload = {
      name: trimmedName,
      connectorType,
      connectorKey: connectorKey.trim() || undefined,
      allowedSource: allowedSource.trim() || undefined,
    };

    try {
      setSaving(true);
      const created = await IntegrationApi.createConnector(payload);
      setName("");
      setConnectorKey("");
      setAllowedSource("");
      await load();
      if (created.provisioningToken?.trim()) {
        Alert.alert(
          x("Connector created", "कनेक्टर बन गया"),
          x(
            `Save this token now: ${created.provisioningToken}`,
            `यह टोकन अभी सेव करें: ${created.provisioningToken}`
          )
        );
      } else {
        Alert.alert(x("Connector created", "कनेक्टर बन गया"));
      }
    } catch (e: any) {
      Alert.alert(
        x("Failed to create connector", "कनेक्टर बन नहीं पाया"),
        e?.message ?? x("Please check values and retry.", "वैल्यू जांचकर दोबारा कोशिश करें।")
      );
    } finally {
      setSaving(false);
    }
  };

  const onToggleConnectorStatus = async (row: IntegrationConnectorResponse) => {
    const nextStatus = row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      setSaving(true);
      await IntegrationApi.updateConnectorStatus(row.connectorId, {
        status: nextStatus,
        reason: x("Updated from mobile integration dashboard", "मोबाइल इंटीग्रेशन डैशबोर्ड से अपडेट"),
      });
      await load();
    } catch (e: any) {
      Alert.alert(
        x("Could not update connector status", "कनेक्टर स्टेटस अपडेट नहीं हुआ"),
        e?.message ?? x("Please retry.", "कृपया फिर से कोशिश करें।")
      );
    } finally {
      setSaving(false);
    }
  };

  const onRotateToken = async (row: IntegrationConnectorResponse) => {
    try {
      setSaving(true);
      const rotated = await IntegrationApi.rotateConnectorToken(row.connectorId);
      await load();
      Alert.alert(
        x("Token rotated", "टोकन बदल दिया गया"),
        x(
          `New token for ${rotated.connectorKey}: ${rotated.provisioningToken}`,
          `${rotated.connectorKey} का नया टोकन: ${rotated.provisioningToken}`
        )
      );
    } catch (e: any) {
      Alert.alert(
        x("Could not rotate token", "टोकन रोटेट नहीं हुआ"),
        e?.message ?? x("Please retry.", "कृपया फिर से कोशिश करें।")
      );
    } finally {
      setSaving(false);
    }
  };

  if (!canView) {
    return (
      <View style={{ flex: 1, backgroundColor: DairyColors.background, padding: 16 }}>
        <Text style={{ color: DairyColors.textPrimary, fontSize: 24, fontWeight: "800" }}>
          {x("Integrations", "इंटीग्रेशन")}
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
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View>
          <Text style={{ color: DairyColors.textPrimary, fontSize: 24, fontWeight: "800" }}>
            {x("Integration Ops", "इंटीग्रेशन ऑप्स")}
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x("Connector status, mapping and ingest error visibility", "कनेक्टर स्टेटस, मैपिंग और इनजेस्ट एरर दृश्यता")}
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
        <MetricCard label={x("Connectors", "कनेक्टर")} value={connectors.length} />
        <MetricCard label={x("Active", "सक्रिय")} value={monitoring?.activeConnectors ?? 0} />
        <MetricCard label={x("Failed (24h)", "असफल (24h)")} value={monitoring?.last24hFailedEvents ?? 0} />
        <MetricCard label={x("Events (24h)", "इवेंट (24h)")} value={monitoring?.last24hEvents ?? 0} />
      </View>

      {canManage ? (
        <View
          style={{
            marginTop: 14,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: DairyColors.border,
            backgroundColor: DairyColors.surface,
            padding: 12,
            gap: 10,
          }}
        >
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
            {x("Create Connector", "नया कनेक्टर बनाएं")}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={x("Connector name", "कनेक्टर नाम")}
            placeholderTextColor={DairyColors.textSecondary}
            style={{
              borderWidth: 1,
              borderColor: DairyColors.border,
              borderRadius: 10,
              backgroundColor: DairyColors.background,
              color: DairyColors.textPrimary,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {CONNECTOR_TYPES.map((row) => (
              <Pressable
                key={row}
                onPress={() => setConnectorType(row)}
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: connectorType === row ? DairyColors.primary : DairyColors.border,
                  backgroundColor: connectorType === row ? DairyColors.primarySoft : DairyColors.surface,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text
                  style={{
                    color: connectorType === row ? DairyColors.primary : DairyColors.textSecondary,
                    fontWeight: "700",
                  }}
                >
                  {row}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={connectorKey}
            onChangeText={setConnectorKey}
            placeholder={x("Connector key (optional)", "कनेक्टर key (वैकल्पिक)")}
            placeholderTextColor={DairyColors.textSecondary}
            autoCapitalize="none"
            style={{
              borderWidth: 1,
              borderColor: DairyColors.border,
              borderRadius: 10,
              backgroundColor: DairyColors.background,
              color: DairyColors.textPrimary,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          />
          <TextInput
            value={allowedSource}
            onChangeText={setAllowedSource}
            placeholder={x("Allowed source IP prefix (optional)", "अनुमत source IP prefix (वैकल्पिक)")}
            placeholderTextColor={DairyColors.textSecondary}
            autoCapitalize="none"
            style={{
              borderWidth: 1,
              borderColor: DairyColors.border,
              borderRadius: 10,
              backgroundColor: DairyColors.background,
              color: DairyColors.textPrimary,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          />
          <Pressable
            onPress={() => void onCreateConnector()}
            disabled={saving}
            style={{
              borderRadius: 10,
              backgroundColor: saving ? DairyColors.textSecondary : DairyColors.primary,
              paddingVertical: 10,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "white", fontWeight: "800" }}>
              {saving ? x("Saving...", "सेव हो रहा...") : x("Create Connector", "कनेक्टर बनाएं")}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={{ marginTop: 14 }}>
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
          {x("Connector Status", "कनेक्टर स्टेटस")}
        </Text>
        <View style={{ marginTop: 8, gap: 10 }}>
          {connectors.map((row) => {
            const tone = statusTone(row.status);
            const metrics = connectorMetricsById.get(row.connectorId);
            return (
              <View
                key={row.connectorId}
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  backgroundColor: DairyColors.surface,
                  padding: 12,
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>{row.name}</Text>
                    <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                      {row.connectorType} • {row.connectorKey}
                    </Text>
                  </View>
                  <View style={{ borderRadius: 999, backgroundColor: tone.bg, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ color: tone.text, fontWeight: "800" }}>{row.status}</Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: 14, flexWrap: "wrap" }}>
                  <Text style={{ color: DairyColors.textSecondary }}>
                    {x(`Total ${metrics?.totalEvents ?? 0}`, `कुल ${metrics?.totalEvents ?? 0}`)}
                  </Text>
                  <Text style={{ color: DairyColors.textSecondary }}>
                    {x(`Normalized ${metrics?.normalizedEvents ?? 0}`, `नॉर्मलाइज्ड ${metrics?.normalizedEvents ?? 0}`)}
                  </Text>
                  <Text style={{ color: DairyColors.textSecondary }}>
                    {x(`Failed ${metrics?.failedEvents ?? 0}`, `असफल ${metrics?.failedEvents ?? 0}`)}
                  </Text>
                </View>

                {row.lastError?.trim() ? (
                  <Text style={{ color: DairyColors.danger, fontWeight: "600" }}>
                    {x(`Last error: ${row.lastError}`, `पिछली त्रुटि: ${row.lastError}`)}
                  </Text>
                ) : null}

                {canManage ? (
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    <Pressable
                      onPress={() => void onToggleConnectorStatus(row)}
                      disabled={saving}
                      style={{
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: DairyColors.border,
                        backgroundColor: DairyColors.surfaceMuted,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                      }}
                    >
                      <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                        {row.status === "ACTIVE"
                          ? x("Set INACTIVE", "INACTIVE करें")
                          : x("Set ACTIVE", "ACTIVE करें")}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => void onRotateToken(row)}
                      disabled={saving}
                      style={{
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: DairyColors.info,
                        backgroundColor: DairyColors.infoSoft,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                      }}
                    >
                      <Text style={{ color: DairyColors.info, fontWeight: "700" }}>
                        {x("Rotate Token", "टोकन बदलें")}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
          {!connectors.length ? (
            <Text style={{ color: DairyColors.textSecondary }}>
              {x("No connectors found.", "कोई कनेक्टर नहीं मिला।")}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ marginTop: 14 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
            {x("Ingest Events", "इनजेस्ट इवेंट")}
          </Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {EVENT_STATUS_OPTIONS.map((row) => (
              <Pressable
                key={row}
                onPress={() => setEventStatus(row)}
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: eventStatus === row ? DairyColors.primary : DairyColors.border,
                  backgroundColor: eventStatus === row ? DairyColors.primarySoft : DairyColors.surface,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text
                  style={{
                    color: eventStatus === row ? DairyColors.primary : DairyColors.textSecondary,
                    fontWeight: "700",
                    fontSize: 12,
                  }}
                >
                  {row}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ marginTop: 8, gap: 10 }}>
          {events.map((row) => {
            const tone = statusTone(row.status);
            return (
              <View
                key={row.integrationEventId}
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  backgroundColor: DairyColors.surface,
                  padding: 10,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                      {row.connectorKey} • {row.eventType ?? x("Unknown event", "अज्ञात इवेंट")}
                    </Text>
                    <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                      {x(`Device ${row.deviceId ?? "-"}`, `डिवाइस ${row.deviceId ?? "-"}`)} •{" "}
                      {row.receivedAt ? new Date(row.receivedAt).toLocaleString() : "-"}
                    </Text>
                  </View>
                  <View style={{ borderRadius: 999, backgroundColor: tone.bg, paddingHorizontal: 8, paddingVertical: 5 }}>
                    <Text style={{ color: tone.text, fontWeight: "700", fontSize: 12 }}>{row.status}</Text>
                  </View>
                </View>
                {row.errorMessage?.trim() ? (
                  <Text style={{ marginTop: 6, color: DairyColors.danger, fontWeight: "600" }}>
                    {x(`Error: ${row.errorMessage}`, `त्रुटि: ${row.errorMessage}`)}
                  </Text>
                ) : null}
              </View>
            );
          })}
          {!events.length ? (
            <Text style={{ color: DairyColors.textSecondary }}>
              {x("No events for current filter.", "वर्तमान फ़िल्टर के लिए कोई इवेंट नहीं है।")}
            </Text>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}
