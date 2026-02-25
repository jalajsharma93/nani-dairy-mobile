import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { DairyColors } from "../../constants/dairy-theme";
import { AuthApi } from "../../services/api";
import { AppLanguage, useI18n } from "../../state/i18n";

const LANGUAGES: AppLanguage[] = ["en", "hi"];

export default function SettingsScreen() {
  const { language, setLanguage, t, x } = useI18n();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const onChangePassword = async () => {
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      Alert.alert(
        x("Missing details", "जानकारी अधूरी"),
        x("Please fill all password fields.", "सभी पासवर्ड फील्ड भरें।")
      );
      return;
    }
    if (newPassword.trim().length < 6) {
      Alert.alert(
        x("Invalid password", "पासवर्ड सही नहीं"),
        x("New password must be at least 6 characters.", "नया पासवर्ड कम से कम 6 अक्षर का होना चाहिए।")
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(
        x("Mismatch", "मेल नहीं खा रहा"),
        x("New password and confirm password must match.", "नया पासवर्ड और कन्फर्म पासवर्ड समान होना चाहिए।")
      );
      return;
    }

    setPasswordSaving(true);
    try {
      await AuthApi.changePassword({
        currentPassword: currentPassword.trim(),
        newPassword: newPassword.trim(),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      Alert.alert(
        x("Password updated", "पासवर्ड बदल गया"),
        x("Your password has been changed successfully.", "आपका पासवर्ड सफलतापूर्वक बदल गया है।")
      );
    } catch (e: any) {
      Alert.alert(
        x("Update failed", "अपडेट नहीं हुआ"),
        e?.message ?? x("Please try again.", "कृपया फिर कोशिश करें।")
      );
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: DairyColors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
    >
      <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
        {t("settings.title")}
      </Text>
      <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
        {t("settings.subtitle")}
      </Text>

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
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
          {t("settings.languageTitle")}
        </Text>
        <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
          {t("settings.languageSubtitle")}
        </Text>

        <View style={{ marginTop: 10, flexDirection: "row", gap: 10 }}>
          {LANGUAGES.map((entry) => {
            const isSelected = language === entry;
            return (
              <Pressable
                key={entry}
                onPress={() => setLanguage(entry)}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: isSelected ? DairyColors.primary : DairyColors.border,
                  borderRadius: 12,
                  backgroundColor: isSelected ? DairyColors.primarySoft : DairyColors.surface,
                  paddingVertical: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                  {entry === "en" ? t("settings.english") : t("settings.hindi")}
                </Text>
                {isSelected ? (
                  <Text style={{ marginTop: 4, color: DairyColors.primary, fontWeight: "700", fontSize: 12 }}>
                    {t("settings.current")}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
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
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
          {x("Change Password", "पासवर्ड बदलें")}
        </Text>
        <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
          {x("Use this to update your login password.", "लॉगिन पासवर्ड बदलने के लिए इसका उपयोग करें।")}
        </Text>

        <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
          {x("Current Password", "वर्तमान पासवर्ड")}
        </Text>
        <TextInput
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={x("Current Password", "वर्तमान पासवर्ड")}
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
          {x("New Password", "नया पासवर्ड")}
        </Text>
        <TextInput
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={x("New Password (min 6 chars)", "नया पासवर्ड (कम से कम 6 अक्षर)")}
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
          {x("Confirm New Password", "नया पासवर्ड कन्फर्म करें")}
        </Text>
        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={x("Confirm New Password", "नया पासवर्ड कन्फर्म करें")}
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

        <Pressable
          onPress={onChangePassword}
          disabled={passwordSaving}
          style={{
            marginTop: 12,
            borderRadius: 10,
            backgroundColor: passwordSaving ? DairyColors.textSecondary : DairyColors.primary,
            paddingVertical: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "800" }}>
            {passwordSaving ? x("Updating...", "अपडेट हो रहा...") : x("Update Password", "पासवर्ड अपडेट करें")}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
