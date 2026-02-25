import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { DairyColors } from "../app/constants/dairy-theme";
import { useI18n } from "../app/state/i18n";

type ReadOnlyBannerProps = {
  subtitle?: string;
};

export function ReadOnlyBanner({ subtitle }: ReadOnlyBannerProps) {
  const { t } = useI18n();
  return (
    <View
      style={{
        marginTop: 12,
        borderRadius: 12,
        backgroundColor: DairyColors.warningSoft,
        padding: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      <Ionicons name="shield-checkmark" size={16} color={DairyColors.warning} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: DairyColors.warning, fontWeight: "800" }}>{t("common.readOnly")}</Text>
        <Text style={{ marginTop: 2, color: DairyColors.warning }}>
          {subtitle ?? t("common.readOnlyDesc")}
        </Text>
      </View>
    </View>
  );
}
