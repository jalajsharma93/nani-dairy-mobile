import { Stack } from "expo-router";
import { DairyColors } from "./constants/dairy-theme";
import { DairyTypography } from "./constants/typography";
import { AuthProvider } from "./state/auth";
import { I18nProvider } from "./state/i18n";

export default function RootLayout() {
  return (
    <I18nProvider>
      <AuthProvider>
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
