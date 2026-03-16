import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
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
  ApprovalRequestResponse,
  ApprovalStatus,
  GovernanceApi,
  UserRole,
} from "@/src/services/api";
import { useAuth } from "@/src/state/auth";
import { useI18n } from "@/src/state/i18n";
import { resolveRolePermissions } from "@/src/state/permissions";

const STATUS_OPTIONS: (ApprovalStatus | "ALL")[] = [
  "ALL",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
];

const APPROVER_ROLE_OPTIONS: UserRole[] = ["ADMIN", "MANAGER"];

function approvalTone(status: ApprovalStatus) {
  if (status === "APPROVED") {
    return { bg: DairyColors.successSoft, text: DairyColors.success };
  }
  if (status === "REJECTED" || status === "CANCELLED") {
    return { bg: DairyColors.dangerSoft, text: DairyColors.danger };
  }
  return { bg: DairyColors.warningSoft, text: DairyColors.warning };
}

export default function GovernanceScreen() {
  const { user } = useAuth();
  const { x } = useI18n();
  const permissions = resolveRolePermissions(user?.role);
  const canReview = permissions.isAdmin || permissions.isManager;
  const canAudit = permissions.isAdmin || permissions.isManager;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actingOnId, setActingOnId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | "ALL">("ALL");
  const [approvals, setApprovals] = useState<ApprovalRequestResponse[]>([]);
  const [audits, setAudits] = useState<
    {
      auditEventId: string;
      module: string;
      actionType: string;
      targetRefId?: string | null;
      actorUsername: string;
      actorRole: string;
      payloadJson?: string | null;
      createdAt?: string | null;
    }[]
  >([]);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});

  const [moduleName, setModuleName] = useState("SALES");
  const [actionType, setActionType] = useState("PRICE_EDIT");
  const [targetRefId, setTargetRefId] = useState("");
  const [requiredApproverRole, setRequiredApproverRole] = useState<UserRole>("ADMIN");
  const [requestReason, setRequestReason] = useState("");
  const [requestPayload, setRequestPayload] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [approvalsRes, auditsRes] = await Promise.all([
        GovernanceApi.approvals(statusFilter === "ALL" ? undefined : statusFilter),
        canAudit ? GovernanceApi.audits({ limit: 80 }) : Promise.resolve([]),
      ]);
      setApprovals(approvalsRes);
      setAudits(auditsRes);
    } catch (e: any) {
      Alert.alert(
        x("Could not load governance data", "गवर्नेंस डेटा लोड नहीं हुआ"),
        e?.message ?? x("Please retry.", "कृपया फिर से कोशिश करें।")
      );
    } finally {
      setLoading(false);
    }
  }, [canAudit, statusFilter, x]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreateRequest = async () => {
    const trimmedReason = requestReason.trim();
    if (!trimmedReason) {
      Alert.alert(x("Reason is required", "कारण जरूरी है"));
      return;
    }

    try {
      setSaving(true);
      await GovernanceApi.requestApproval({
        module: moduleName.trim() || "GENERAL",
        actionType: actionType.trim() || "MANUAL_ACTION",
        targetRefId: targetRefId.trim() || undefined,
        requiredApproverRole,
        requestReason: trimmedReason,
        requestPayloadJson: requestPayload.trim() || undefined,
      });
      setRequestReason("");
      setRequestPayload("");
      setTargetRefId("");
      await load();
      Alert.alert(x("Approval request created", "अप्रूवल रिक्वेस्ट बन गई"));
    } catch (e: any) {
      Alert.alert(
        x("Could not create approval request", "अप्रूवल रिक्वेस्ट नहीं बनी"),
        e?.message ?? x("Please retry.", "कृपया फिर से कोशिश करें।")
      );
    } finally {
      setSaving(false);
    }
  };

  const onDecision = async (row: ApprovalRequestResponse, decision: "approve" | "reject") => {
    try {
      setActingOnId(row.approvalRequestId);
      const note = decisionNotes[row.approvalRequestId]?.trim() || undefined;
      if (decision === "approve") {
        await GovernanceApi.approve(row.approvalRequestId, { decisionNote: note });
      } else {
        await GovernanceApi.reject(row.approvalRequestId, { decisionNote: note });
      }
      setDecisionNotes((prev) => ({ ...prev, [row.approvalRequestId]: "" }));
      await load();
    } catch (e: any) {
      Alert.alert(
        x("Decision failed", "निर्णय सेव नहीं हुआ"),
        e?.message ?? x("Please retry.", "कृपया फिर से कोशिश करें।")
      );
    } finally {
      setActingOnId(null);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: DairyColors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View>
          <Text style={{ color: DairyColors.textPrimary, fontSize: 24, fontWeight: "800" }}>
            {x("Governance", "गवर्नेंस")}
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x("Approval queue and immutable audit timeline", "अप्रूवल कतार और इम्यूटेबल ऑडिट टाइमलाइन")}
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

      <View
        style={{
          marginTop: 12,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: DairyColors.border,
          backgroundColor: DairyColors.surface,
          padding: 12,
          gap: 10,
        }}
      >
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
          {x("Request Approval", "अप्रूवल मांगें")}
        </Text>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            value={moduleName}
            onChangeText={setModuleName}
            placeholder="MODULE"
            autoCapitalize="characters"
            placeholderTextColor={DairyColors.textSecondary}
            style={{
              flex: 1,
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
            value={actionType}
            onChangeText={setActionType}
            placeholder="ACTION_TYPE"
            autoCapitalize="characters"
            placeholderTextColor={DairyColors.textSecondary}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: DairyColors.border,
              borderRadius: 10,
              backgroundColor: DairyColors.background,
              color: DairyColors.textPrimary,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          />
        </View>

        <TextInput
          value={targetRefId}
          onChangeText={setTargetRefId}
          placeholder={x("Target reference ID (optional)", "टार्गेट रेफरेंस ID (वैकल्पिक)")}
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

        <View style={{ flexDirection: "row", gap: 8 }}>
          {APPROVER_ROLE_OPTIONS.map((role) => (
            <Pressable
              key={role}
              onPress={() => setRequiredApproverRole(role)}
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: requiredApproverRole === role ? DairyColors.primary : DairyColors.border,
                backgroundColor: requiredApproverRole === role ? DairyColors.primarySoft : DairyColors.surface,
                paddingHorizontal: 10,
                paddingVertical: 7,
              }}
            >
              <Text
                style={{
                  color: requiredApproverRole === role ? DairyColors.primary : DairyColors.textSecondary,
                  fontWeight: "700",
                }}
              >
                {x(`Approver ${role}`, `अप्रूवर ${role}`)}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          value={requestReason}
          onChangeText={setRequestReason}
          placeholder={x("Reason (required)", "कारण (जरूरी)")}
          multiline
          placeholderTextColor={DairyColors.textSecondary}
          style={{
            minHeight: 74,
            textAlignVertical: "top",
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
          value={requestPayload}
          onChangeText={setRequestPayload}
          placeholder={x("Payload JSON (optional)", "Payload JSON (वैकल्पिक)")}
          multiline
          placeholderTextColor={DairyColors.textSecondary}
          style={{
            minHeight: 70,
            textAlignVertical: "top",
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
          onPress={() => void onCreateRequest()}
          disabled={saving}
          style={{
            borderRadius: 10,
            backgroundColor: saving ? DairyColors.textSecondary : DairyColors.primary,
            paddingVertical: 10,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "800" }}>
            {saving ? x("Saving...", "सेव हो रहा...") : x("Submit Approval Request", "अप्रूवल रिक्वेस्ट सबमिट करें")}
          </Text>
        </Pressable>
      </View>

      <View style={{ marginTop: 14 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
            {x("Approval Inbox", "अप्रूवल इनबॉक्स")}
          </Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {STATUS_OPTIONS.map((row) => (
              <Pressable
                key={row}
                onPress={() => setStatusFilter(row)}
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: statusFilter === row ? DairyColors.primary : DairyColors.border,
                  backgroundColor: statusFilter === row ? DairyColors.primarySoft : DairyColors.surface,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text
                  style={{
                    color: statusFilter === row ? DairyColors.primary : DairyColors.textSecondary,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  {row}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ marginTop: 8, gap: 10 }}>
          {approvals.map((row) => {
            const tone = approvalTone(row.status);
            const statusTime = row.decidedAt
              ? new Date(row.decidedAt).toLocaleString()
              : row.createdAt
                ? new Date(row.createdAt).toLocaleString()
                : "-";
            const canAct = canReview && row.status === "PENDING";
            const acting = actingOnId === row.approvalRequestId;
            return (
              <View
                key={row.approvalRequestId}
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
                    <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                      {row.module} • {row.actionType}
                    </Text>
                    <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                      {x(`Requested by ${row.requestedByUsername} (${row.requestedByRole})`, `अनुरोधकर्ता ${row.requestedByUsername} (${row.requestedByRole})`)}
                    </Text>
                  </View>
                  <View style={{ borderRadius: 999, backgroundColor: tone.bg, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ color: tone.text, fontWeight: "800" }}>{row.status}</Text>
                  </View>
                </View>

                {row.targetRefId?.trim() ? (
                  <Text style={{ color: DairyColors.textSecondary }}>
                    {x(`Target: ${row.targetRefId}`, `टार्गेट: ${row.targetRefId}`)}
                  </Text>
                ) : null}

                <Text style={{ color: DairyColors.textPrimary }}>
                  {x(`Reason: ${row.requestReason}`, `कारण: ${row.requestReason}`)}
                </Text>
                <Text style={{ color: DairyColors.textSecondary }}>
                  {x(`Required approver: ${row.requiredApproverRole} • Time: ${statusTime}`, `जरूरी अप्रूवर: ${row.requiredApproverRole} • समय: ${statusTime}`)}
                </Text>
                {row.decisionNote?.trim() ? (
                  <Text style={{ color: DairyColors.info }}>
                    {x(`Decision note: ${row.decisionNote}`, `निर्णय नोट: ${row.decisionNote}`)}
                  </Text>
                ) : null}

                {canAct ? (
                  <View style={{ gap: 8 }}>
                    <TextInput
                      value={decisionNotes[row.approvalRequestId] ?? ""}
                      onChangeText={(value) =>
                        setDecisionNotes((prev) => ({ ...prev, [row.approvalRequestId]: value }))
                      }
                      placeholder={x("Decision note (optional)", "निर्णय नोट (वैकल्पिक)")}
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
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable
                        onPress={() => void onDecision(row, "approve")}
                        disabled={acting}
                        style={{
                          flex: 1,
                          borderRadius: 10,
                          backgroundColor: acting ? DairyColors.textSecondary : DairyColors.success,
                          paddingVertical: 9,
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ color: "white", fontWeight: "800" }}>
                          {x("Approve", "स्वीकृत करें")}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void onDecision(row, "reject")}
                        disabled={acting}
                        style={{
                          flex: 1,
                          borderRadius: 10,
                          backgroundColor: acting ? DairyColors.textSecondary : DairyColors.danger,
                          paddingVertical: 9,
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ color: "white", fontWeight: "800" }}>
                          {x("Reject", "अस्वीकृत करें")}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
          {!approvals.length ? (
            <Text style={{ color: DairyColors.textSecondary }}>
              {x("No approval records for selected filter.", "चुने फ़िल्टर के लिए कोई अप्रूवल रिकॉर्ड नहीं है।")}
            </Text>
          ) : null}
        </View>
      </View>

      {canAudit ? (
        <View style={{ marginTop: 14 }}>
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
            {x("Immutable Audit Timeline", "इम्यूटेबल ऑडिट टाइमलाइन")}
          </Text>
          <View style={{ marginTop: 8, gap: 10 }}>
            {audits.map((row) => (
              <View
                key={row.auditEventId}
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  backgroundColor: DairyColors.surface,
                  padding: 10,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                  {row.module} • {row.actionType}
                </Text>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x(`Actor ${row.actorUsername} (${row.actorRole})`, `यूज़र ${row.actorUsername} (${row.actorRole})`)}
                </Text>
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {row.createdAt ? new Date(row.createdAt).toLocaleString() : "-"}
                </Text>
                {row.targetRefId?.trim() ? (
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                    {x(`Target ${row.targetRefId}`, `टार्गेट ${row.targetRefId}`)}
                  </Text>
                ) : null}
              </View>
            ))}
            {!audits.length ? (
              <Text style={{ color: DairyColors.textSecondary }}>
                {x("No audit events yet.", "अभी कोई ऑडिट इवेंट नहीं है।")}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
