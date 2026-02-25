import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { DairyColors } from "../../constants/dairy-theme";
import { useAuth } from "../../state/auth";
import { useI18n } from "../../state/i18n";

type ServiceCardProps = {
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
};

function ServiceCard({ title, subtitle, icon, onPress }: ServiceCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: DairyColors.border,
        borderRadius: 14,
        backgroundColor: DairyColors.surface,
        padding: 14,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: DairyColors.primarySoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={icon} size={20} color={DairyColors.primary} />
        </View>
        <Ionicons name="chevron-forward" size={18} color={DairyColors.textSecondary} />
      </View>

      <Text style={{ marginTop: 10, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 17 }}>
        {title}
      </Text>
      <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>{subtitle}</Text>
    </Pressable>
  );
}

export default function ServicesScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { t, x } = useI18n();
  const isVet = user?.role === "VET";
  const isDelivery = user?.role === "DELIVERY";
  const isFeedManager = user?.role === "FEED_MANAGER";
  const isAdmin = user?.role === "ADMIN";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: DairyColors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>{t("services.title")}</Text>
          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
            {t("services.subtitle")}
          </Text>
        </View>
        <Pressable
          onPress={signOut}
          style={{
            borderRadius: 999,
            backgroundColor: DairyColors.dangerSoft,
            borderWidth: 1,
            borderColor: DairyColors.danger,
            paddingHorizontal: 12,
            paddingVertical: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Ionicons name="log-out" size={14} color={DairyColors.danger} />
          <Text style={{ color: DairyColors.danger, fontWeight: "800" }}>{t("services.signOut")}</Text>
        </Pressable>
      </View>

      <View
        style={{
          marginTop: 10,
          borderRadius: 10,
          backgroundColor: DairyColors.accentSoft,
          paddingHorizontal: 10,
          paddingVertical: 8,
          alignSelf: "flex-start",
        }}
      >
        <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
          {t("services.loggedInAs")}: {user?.username ?? x("unknown", "अज्ञात")} ({user?.role ?? x("UNKNOWN", "अज्ञात")})
        </Text>
      </View>

      <View
        style={{
          marginTop: 12,
          borderRadius: 14,
          backgroundColor: DairyColors.infoSoft,
          padding: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Ionicons name="information-circle" size={16} color={DairyColors.info} />
        <Text style={{ color: DairyColors.info }}>
          {t("services.coreInfo")}
        </Text>
      </View>

      <View style={{ marginTop: 14, gap: 10 }}>
        {!isDelivery && !isFeedManager ? (
          <ServiceCard
            title={t("services.animalHealthTitle")}
            subtitle={t("services.animalHealthSubtitle")}
            icon="medkit"
            onPress={() => router.push("/health")}
          />
        ) : null}

        {!isDelivery && !isFeedManager ? (
          <ServiceCard
            title={t("services.breedingTitle")}
            subtitle={t("services.breedingSubtitle")}
            icon="heart"
            onPress={() => router.push("/breeding")}
          />
        ) : null}

        {!isDelivery && !isFeedManager ? (
          <ServiceCard
            title={t("services.treatmentsTitle")}
            subtitle={t("services.treatmentsSubtitle")}
            icon="medkit"
            onPress={() => router.push("/treatments")}
          />
        ) : null}

        {!isDelivery && !isVet ? (
          <ServiceCard
            title={t("services.worklistTitle")}
            subtitle={t("services.worklistSubtitle")}
            icon="list"
            onPress={() => router.push("/worklist")}
          />
        ) : null}

        {!isDelivery && !isVet && !isFeedManager ? (
          <ServiceCard
            title={t("services.employeesTitle")}
            subtitle={t("services.employeesSubtitle")}
            icon="people"
            onPress={() => router.push("/employees")}
          />
        ) : null}

        {!isVet && !isFeedManager ? (
          <ServiceCard
            title={x("Customers", "ग्राहक")}
            subtitle={x("Daily subscriptions and customer master data", "दैनिक सब्सक्रिप्शन और ग्राहक मास्टर रिकॉर्ड")}
            icon="people-circle"
            onPress={() => router.push("/customers")}
          />
        ) : null}

        {!isVet && !isFeedManager ? (
          <ServiceCard
            title={t("services.salesTitle")}
            subtitle={t("services.salesSubtitle")}
            icon="cart"
            onPress={() => router.push("/sales")}
          />
        ) : null}

        {!isDelivery && !isVet && !isFeedManager ? (
          <ServiceCard
            title={t("services.expensesTitle")}
            subtitle={t("services.expensesSubtitle")}
            icon="wallet"
            onPress={() => router.push("/expenses")}
          />
        ) : null}

        <ServiceCard
          title={t("services.profileTitle")}
          subtitle={t("services.profileSubtitle")}
          icon="person-circle"
          onPress={() => router.push("/profile")}
        />

        {isAdmin ? (
          <ServiceCard
            title={x("User Management", "यूज़र प्रबंधन")}
            subtitle={x("Create login users and assign roles", "लॉगिन यूज़र बनाएं और रोल दें")}
            icon="people-circle"
            onPress={() => router.push("/users")}
          />
        ) : null}

        <ServiceCard
          title={t("services.settingsTitle")}
          subtitle={t("services.settingsSubtitle")}
          icon="settings"
          onPress={() => router.push("/settings")}
        />

        <ServiceCard
          title={t("services.signOut")}
          subtitle={t("services.signOutSubtitle")}
          icon="log-out"
          onPress={signOut}
        />
      </View>
    </ScrollView>
  );
}
