import { Redirect } from "expo-router";
import { useState } from "react";
import { Alert, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useAuth } from "./state/auth";
import { DairyColors } from "./constants/dairy-theme";
import { useI18n } from "./state/i18n";
import { API_BASE_URL } from "./services/api";

export default function LoginScreen() {
  const { user, signIn, loginLoading } = useAuth();
  const { t, x } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const likelyWrongBaseUrl =
    Platform.OS !== "web" &&
    (API_BASE_URL.includes("localhost") || API_BASE_URL.includes("10.0.2.2"));

  if (user) {
    return <Redirect href="/" />;
  }

  const onLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert(t("login.missingTitle"), t("login.missingBody"));
      return;
    }

    try {
      await signIn(username.trim(), password);
    } catch (e: any) {
      console.error(e);
      Alert.alert(t("login.failedTitle"), e?.message ?? t("login.failedBody"));
    }
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: DairyColors.background,
        padding: 20,
        justifyContent: "center",
      }}
    >
      <Text style={{ color: DairyColors.textPrimary, fontSize: 28, fontWeight: "800" }}>{t("login.title")}</Text>
      <Text style={{ marginTop: 6, color: DairyColors.textSecondary }}>
        {t("login.subtitle")}
      </Text>
      <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
        API: {API_BASE_URL}
      </Text>
      <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
        {x("Use your assigned username and password.", "अपना दिया गया यूज़रनेम और पासवर्ड इस्तेमाल करें।")}
      </Text>

      {likelyWrongBaseUrl ? (
        <Text style={{ marginTop: 6, color: DairyColors.warning }}>
          {x(
            "If using a real phone, set EXPO_PUBLIC_API_BASE_URL to your laptop IP (e.g. http://192.168.1.153:8080).",
            "अगर असली फोन पर चला रहे हैं, EXPO_PUBLIC_API_BASE_URL में लैपटॉप का IP दें (जैसे http://192.168.1.153:8080)।"
          )}
        </Text>
      ) : null}

      <View
        style={{
          marginTop: 16,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: DairyColors.border,
          backgroundColor: DairyColors.surface,
          padding: 14,
        }}
      >
        <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>{t("login.username")}</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={t("login.username")}
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
          {t("login.password")}
        </Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={t("login.password")}
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
          disabled={loginLoading}
          onPress={onLogin}
          style={{
            marginTop: 12,
            borderRadius: 10,
            backgroundColor: loginLoading ? DairyColors.textSecondary : DairyColors.primary,
            paddingVertical: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "800" }}>
            {loginLoading ? t("login.signingIn") : t("login.signIn")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
