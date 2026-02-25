import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { DairyColors } from "../../constants/dairy-theme";
import {
  AuthApi,
  AuthUserResponse,
  CreateAuthUserPayload,
  UpdateAuthUserPayload,
  UserRole,
} from "../../services/api";
import { useAuth } from "../../state/auth";
import { useI18n } from "../../state/i18n";

const ROLE_OPTIONS: UserRole[] = ["ADMIN", "MANAGER", "WORKER", "FEED_MANAGER", "DELIVERY", "VET"];

export default function UsersScreen() {
  const { hasAnyRole } = useAuth();
  const { x } = useI18n();
  const isAdmin = hasAnyRole("ADMIN");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<AuthUserResponse[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("WORKER");
  const [active, setActive] = useState(true);

  const isEditMode = !!editingUserId;

  const loadUsers = useCallback(async () => {
    if (!isAdmin) {
      return;
    }
    setLoading(true);
    try {
      const data = await AuthApi.listUsers();
      setUsers(data);
    } catch (e: any) {
      Alert.alert(
        x("Failed to load users", "यूज़र लोड नहीं हुए"),
        e?.message ?? x("Please try again.", "कृपया फिर कोशिश करें।")
      );
    } finally {
      setLoading(false);
    }
  }, [isAdmin, x]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const clearForm = useCallback(() => {
    setEditingUserId(null);
    setUsername("");
    setFullName("");
    setPassword("");
    setRole("WORKER");
    setActive(true);
  }, []);

  const onEdit = useCallback((item: AuthUserResponse) => {
    setEditingUserId(item.userId);
    setUsername(item.username);
    setFullName(item.fullName ?? "");
    setPassword("");
    setRole(item.role);
    setActive(item.active);
  }, []);

  const onSave = useCallback(async () => {
    if (!isAdmin) {
      return;
    }

    if (!fullName.trim()) {
      Alert.alert(
        x("Missing details", "जानकारी अधूरी"),
        x("Full name is required.", "पूरा नाम जरूरी है।")
      );
      return;
    }

    if (!isEditMode && !username.trim()) {
      Alert.alert(
        x("Missing details", "जानकारी अधूरी"),
        x("Username is required.", "यूज़रनेम जरूरी है।")
      );
      return;
    }

    if (!isEditMode && password.trim().length < 6) {
      Alert.alert(
        x("Invalid password", "पासवर्ड सही नहीं"),
        x("Password must be at least 6 characters.", "पासवर्ड कम से कम 6 अक्षर का होना चाहिए।")
      );
      return;
    }

    if (isEditMode && password.trim().length > 0 && password.trim().length < 6) {
      Alert.alert(
        x("Invalid password", "पासवर्ड सही नहीं"),
        x("New password must be at least 6 characters.", "नया पासवर्ड कम से कम 6 अक्षर का होना चाहिए।")
      );
      return;
    }

    setSaving(true);
    try {
      if (isEditMode && editingUserId) {
        const payload: UpdateAuthUserPayload = {
          fullName: fullName.trim(),
          role,
          active,
          password: password.trim() ? password.trim() : null,
        };
        await AuthApi.updateUser(editingUserId, payload);
        Alert.alert(x("Updated", "अपडेट हुआ"), x("User updated successfully.", "यूज़र सफलतापूर्वक अपडेट हुआ।"));
      } else {
        const payload: CreateAuthUserPayload = {
          username: username.trim(),
          fullName: fullName.trim(),
          role,
          password: password.trim(),
          active,
        };
        await AuthApi.createUser(payload);
        Alert.alert(x("Created", "बन गया"), x("User created successfully.", "यूज़र सफलतापूर्वक बन गया।"));
      }
      await loadUsers();
      clearForm();
    } catch (e: any) {
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Please try again.", "कृपया फिर कोशिश करें।")
      );
    } finally {
      setSaving(false);
    }
  }, [active, clearForm, editingUserId, fullName, isAdmin, isEditMode, loadUsers, password, role, username, x]);

  const roleLabel = useMemo(
    () => (value: UserRole) =>
      value === "FEED_MANAGER"
        ? x("Feed Manager", "फीड मैनेजर")
        : value === "DELIVERY"
          ? x("Delivery", "डिलीवरी")
          : value === "WORKER"
            ? x("Worker", "कर्मचारी")
            : value === "MANAGER"
              ? x("Manager", "मैनेजर")
              : value === "VET"
                ? x("Vet", "पशु डॉक्टर")
                : x("Admin", "एडमिन"),
    [x]
  );

  if (!isAdmin) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: DairyColors.background }}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
      >
        <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
          {x("User Management", "यूज़र प्रबंधन")}
        </Text>
        <Text style={{ marginTop: 6, color: DairyColors.textSecondary }}>
          {x("This screen is available for ADMIN only.", "यह स्क्रीन सिर्फ ADMIN के लिए है।")}
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: DairyColors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
            {x("User Management", "यूज़र प्रबंधन")}
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {x("Create and manage login users.", "लॉगिन यूज़र बनाएं और मैनेज करें।")}
          </Text>
        </View>
        <Pressable
          onPress={loadUsers}
          style={{
            borderWidth: 1,
            borderColor: DairyColors.border,
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: DairyColors.surface,
          }}
        >
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
            {loading ? x("Loading...", "लोड हो रहा...") : x("Refresh", "रीफ्रेश")}
          </Text>
        </Pressable>
      </View>

      <View
        style={{
          marginTop: 14,
          borderWidth: 1,
          borderColor: DairyColors.border,
          borderRadius: 14,
          backgroundColor: DairyColors.surface,
          padding: 12,
        }}
      >
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
          {isEditMode ? x("Update User", "यूज़र अपडेट करें") : x("Add User", "यूज़र जोड़ें")}
        </Text>

        {!isEditMode ? (
          <>
            <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
              {x("Username", "यूज़रनेम")}
            </Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={x("Username", "यूज़रनेम")}
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
          </>
        ) : (
          <Text style={{ marginTop: 10, color: DairyColors.textSecondary }}>
            {x("Username", "यूज़रनेम")}: {username}
          </Text>
        )}

        <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
          {x("Full Name", "पूरा नाम")}
        </Text>
        <TextInput
          value={fullName}
          onChangeText={setFullName}
          placeholder={x("Full Name", "पूरा नाम")}
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
          {isEditMode ? x("New Password (optional)", "नया पासवर्ड (वैकल्पिक)") : x("Password", "पासवर्ड")}
        </Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={
            isEditMode
              ? x("Leave blank to keep current", "वर्तमान पासवर्ड रखने के लिए खाली छोड़ें")
              : x("Password (min 6 chars)", "पासवर्ड (कम से कम 6 अक्षर)")
          }
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
          {x("Role", "रोल")}
        </Text>
        <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {ROLE_OPTIONS.map((item) => (
            <Pressable
              key={item}
              onPress={() => setRole(item)}
              style={{
                borderWidth: 1,
                borderColor: role === item ? DairyColors.primary : DairyColors.border,
                backgroundColor: role === item ? DairyColors.primarySoft : DairyColors.surface,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{roleLabel(item)}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Switch value={active} onValueChange={setActive} />
          <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
            {x("Active user", "सक्रिय यूज़र")}
          </Text>
        </View>

        <View style={{ marginTop: 12, flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={onSave}
            disabled={saving}
            style={{
              flex: 1,
              borderRadius: 10,
              backgroundColor: saving ? DairyColors.textSecondary : DairyColors.primary,
              paddingVertical: 11,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "white", fontWeight: "800" }}>
              {saving
                ? x("Saving...", "सेव हो रहा...")
                : isEditMode
                  ? x("Update User", "यूज़र अपडेट करें")
                  : x("Create User", "यूज़र बनाएं")}
            </Text>
          </Pressable>
          <Pressable
            onPress={clearForm}
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: DairyColors.border,
              backgroundColor: DairyColors.surface,
              paddingVertical: 11,
              paddingHorizontal: 14,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
              {x("Clear", "क्लियर")}
            </Text>
          </Pressable>
        </View>
      </View>

      <View
        style={{
          marginTop: 14,
          borderWidth: 1,
          borderColor: DairyColors.border,
          borderRadius: 14,
          backgroundColor: DairyColors.surface,
          padding: 12,
        }}
      >
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
          {x("Existing Users", "मौजूदा यूज़र")} ({users.length})
        </Text>
        <View style={{ marginTop: 10, gap: 10 }}>
          {users.map((item) => (
            <View
              key={item.userId}
              style={{
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 12,
                backgroundColor: DairyColors.surfaceMuted,
                padding: 10,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>{item.fullName}</Text>
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>@{item.username}</Text>
                  <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                    {x("Role", "रोल")}: {roleLabel(item.role)} |{" "}
                    {item.active ? x("Active", "सक्रिय") : x("Inactive", "निष्क्रिय")}
                  </Text>
                </View>
                <Pressable
                  onPress={() => onEdit(item)}
                  style={{
                    borderWidth: 1,
                    borderColor: DairyColors.primary,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    backgroundColor: DairyColors.primarySoft,
                  }}
                >
                  <Text style={{ color: DairyColors.primary, fontWeight: "800" }}>
                    {x("Edit", "बदलें")}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
          {!users.length ? (
            <Text style={{ color: DairyColors.textSecondary }}>{x("No users found.", "कोई यूज़र नहीं मिला।")}</Text>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}
