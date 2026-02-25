import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { DairyColors } from "../app/constants/dairy-theme";

type ProfileSettingsCardProps = {
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress?: () => void;
};

export function ProfileSettingsCard({
  title,
  subtitle,
  icon,
  onPress,
}: ProfileSettingsCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        marginTop: 8,
        borderWidth: 1,
        borderColor: DairyColors.border,
        borderRadius: 10,
        backgroundColor: DairyColors.surfaceMuted,
        padding: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: DairyColors.primarySoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={16} color={DairyColors.primary} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{title}</Text>
        <Text style={{ marginTop: 2, color: DairyColors.textSecondary, fontSize: 12 }}>
          {subtitle}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color={DairyColors.textSecondary} />
    </Pressable>
  );
}
