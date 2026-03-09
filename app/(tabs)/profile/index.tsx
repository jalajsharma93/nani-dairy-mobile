import { useRouter } from "expo-router";
import { Alert, ScrollView, Text, View } from "react-native";
import { ProfileSettingsCard } from "../../../components/profile-settings-card";
import { DairyColors } from "@/src/constants/dairy-theme";
import { useAuth } from "@/src/state/auth";
import { useI18n } from "@/src/state/i18n";

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { t, x } = useI18n();
  const router = useRouter();
  const onOpenSetting = (label: string) =>
    Alert.alert(t("profile.comingSoon"), `${label} ${t("profile.settingsFuture")}`);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: DairyColors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
    >
      <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>{t("profile.title")}</Text>
      <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>{t("profile.subtitle")}</Text>

      <View
        style={{
          marginTop: 14,
          borderRadius: 16,
          backgroundColor: DairyColors.primary,
          padding: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: "white",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: DairyColors.primary, fontWeight: "800", fontSize: 22 }}>U</Text>
        </View>
        <View>
          <Text style={{ color: "white", fontWeight: "800", fontSize: 18 }}>
            {user?.fullName ?? t("login.title")}
          </Text>
          <Text style={{ marginTop: 2, color: "#DDF0E5" }}>
            @{user?.username ?? x("unknown", "अज्ञात")}
          </Text>
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
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>{t("profile.rolePermissions")}</Text>
        <View style={{ marginTop: 8, borderRadius: 10, backgroundColor: DairyColors.infoSoft, padding: 10 }}>
          <Text style={{ color: DairyColors.info, fontWeight: "700" }}>
            {t("profile.role")}: {user?.role ?? x("UNKNOWN", "अज्ञात")}
          </Text>
          <Text style={{ marginTop: 4, color: DairyColors.info }}>
            {t("profile.roleDesc")}
          </Text>
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
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>{t("profile.settings")}</Text>

        <ProfileSettingsCard
          title={t("profile.accountDetails")}
          subtitle={t("profile.accountDetailsSub")}
          icon="person"
          onPress={() => onOpenSetting(t("profile.accountDetails"))}
        />
        <ProfileSettingsCard
          title={t("profile.notifications")}
          subtitle={t("profile.notificationsSub")}
          icon="notifications"
          onPress={() => onOpenSetting(t("profile.notifications"))}
        />
        <ProfileSettingsCard
          title={t("profile.security")}
          subtitle={t("profile.securitySub")}
          icon="shield-checkmark"
          onPress={() => onOpenSetting(t("profile.security"))}
        />
        <ProfileSettingsCard
          title={t("profile.backup")}
          subtitle={t("profile.backupSub")}
          icon="cloud-upload"
          onPress={() => onOpenSetting(t("profile.backup"))}
        />
        <ProfileSettingsCard
          title={t("profile.preferences")}
          subtitle={t("profile.preferencesSub")}
          icon="options"
          onPress={() => router.push("/settings")}
        />
        <ProfileSettingsCard
          title={t("profile.signOut")}
          subtitle={t("profile.signOutSub")}
          icon="log-out"
          onPress={signOut}
        />
      </View>
    </ScrollView>
  );
}
