import { Platform } from "react-native";

export const DairyTypography = {
  fontFamily: {
    heading:
      Platform.select({
        ios: "AvenirNext-DemiBold",
        android: "serif",
        default: "System",
      }) ?? "System",
    body:
      Platform.select({
        ios: "AvenirNext-Regular",
        android: "sans-serif",
        default: "System",
      }) ?? "System",
    label:
      Platform.select({
        ios: "AvenirNext-Medium",
        android: "sans-serif-medium",
        default: "System",
      }) ?? "System",
    number:
      Platform.select({
        ios: "Menlo",
        android: "monospace",
        default: "monospace",
      }) ?? "monospace",
  },
  size: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    hero: 32,
  },
};
