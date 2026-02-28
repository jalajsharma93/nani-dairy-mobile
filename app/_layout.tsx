import { Stack } from "expo-router";
import { useEffect } from "react";
import { AppState } from "react-native";
import { DairyColors } from "./constants/dairy-theme";
import { DairyTypography } from "./constants/typography";
import { AuthProvider, useAuth } from "./state/auth";
import { I18nProvider } from "./state/i18n";
import { flushPendingSyncOperations } from "./utils/offline-sync";

function AutoSyncAgent() {
  const { token, loading } = useAuth();

  useEffect(() => {
    if (loading || !token) {
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const runSync = async () => {
      if (!active) {
        return;
      }
      try {
        await flushPendingSyncOperations();
      } catch {
        // Keep silent; queue retry runs automatically on next resume/tick.
      }
    };

    void runSync();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void runSync();
      }
    });
    timer = setInterval(() => {
      void runSync();
    }, 30000);

    return () => {
      active = false;
      sub.remove();
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [loading, token]);

  return null;
}

export default function RootLayout() {
  return (
    <I18nProvider>
      <AuthProvider>
        <AutoSyncAgent />
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: DairyColors.background },
            headerStyle: { backgroundColor: DairyColors.surface },
            headerTintColor: DairyColors.textPrimary,
            headerShadowVisible: false,
            headerTitleStyle: {
              fontFamily: DairyTypography.fontFamily.heading,
              fontSize: DairyTypography.size.lg,
            },
          }}
        >
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </AuthProvider>
    </I18nProvider>
  );
}
