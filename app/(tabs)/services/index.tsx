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
  const role = user?.role;
  const isAdmin = role === "ADMIN";
  const canOpenClinical = role === "ADMIN" || role === "MANAGER" || role === "VET";
  const canOpenWorklist = role !== "DELIVERY" && role !== "VET";
  const canOpenEmployees = role === "ADMIN" || role === "MANAGER";
  const canOpenCustomers = role === "ADMIN" || role === "MANAGER" || role === "WORKER" || role === "DELIVERY";
  const canOpenDeliveryOps = role === "ADMIN" || role === "MANAGER" || role === "DELIVERY";
  const canOpenSales = role === "ADMIN" || role === "MANAGER" || role === "WORKER" || role === "DELIVERY";
  const canOpenExpenses = role === "ADMIN";
  const canOpenStock = role === "ADMIN" || role === "MANAGER" || role === "FEED_MANAGER";
  const canOpenTaskManager = role === "ADMIN" || role === "MANAGER" || role === "FEED_MANAGER";

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
        {canOpenClinical ? (
          <ServiceCard
            title={t("services.animalHealthTitle")}
            subtitle={t("services.animalHealthSubtitle")}
            icon="medkit"
            onPress={() => router.push("/health")}
          />
        ) : null}

        {canOpenClinical ? (
          <ServiceCard
            title={t("services.breedingTitle")}
            subtitle={t("services.breedingSubtitle")}
            icon="heart"
            onPress={() => router.push("/breeding")}
          />
        ) : null}

        {canOpenClinical ? (
          <ServiceCard
            title={t("services.treatmentsTitle")}
            subtitle={t("services.treatmentsSubtitle")}
            icon="medkit"
            onPress={() => router.push("/treatments")}
          />
        ) : null}

        {canOpenWorklist ? (
          <ServiceCard
            title={t("services.worklistTitle")}
            subtitle={t("services.worklistSubtitle")}
            icon="list"
            onPress={() => router.push("/worklist")}
          />
        ) : null}

        {canOpenEmployees ? (
          <ServiceCard
            title={t("services.employeesTitle")}
            subtitle={t("services.employeesSubtitle")}
            icon="people"
            onPress={() => router.push("/employees")}
          />
        ) : null}

        {canOpenCustomers ? (
          <ServiceCard
            title={x("Customers", "ग्राहक")}
            subtitle={x("Daily subscriptions and customer master data", "दैनिक सब्सक्रिप्शन और ग्राहक मास्टर रिकॉर्ड")}
            icon="people-circle"
            onPress={() => router.push("/customers")}
          />
        ) : null}

        {canOpenDeliveryOps ? (
          <ServiceCard
            title={x("Delivery Ops", "डिलीवरी ऑप्स")}
            subtitle={x("Route checklist, add-on requests and EOD reconciliation", "रूट चेकलिस्ट, एक्स्ट्रा रिक्वेस्ट और दिन का मिलान")}
            icon="navigate"
            onPress={() => router.push("/delivery-ops")}
          />
        ) : null}

        {canOpenSales ? (
          <ServiceCard
            title={t("services.salesTitle")}
            subtitle={t("services.salesSubtitle")}
            icon="cart"
            onPress={() => router.push("/sales")}
          />
        ) : null}

        {canOpenExpenses ? (
          <ServiceCard
            title={t("services.expensesTitle")}
            subtitle={t("services.expensesSubtitle")}
            icon="wallet"
            onPress={() => router.push("/expenses")}
          />
        ) : null}

        {canOpenStock ? (
          <ServiceCard
            title={x("Stock Manager", "स्टॉक मैनेजर")}
            subtitle={x(
              "Raw material inventory + milk/curd/buttermilk/ghee processing stock",
              "रॉ मटेरियल + दूध/दही/छाछ/घी प्रोसेसिंग स्टॉक"
            )}
            icon="layers"
            onPress={() => router.push("/stock")}
          />
        ) : null}

        <ServiceCard
          title={x("Today Tasks", "आज के टास्क")}
          subtitle={x(
            "Worker-friendly checklist grouped by due time",
            "वर्कर फ्रेंडली चेकलिस्ट, समय के हिसाब से ग्रुप की हुई"
          )}
          icon="today"
          onPress={() => router.push("/today-tasks")}
        />

        {canOpenTaskManager ? (
          <ServiceCard
            title={x("Task Manager", "टास्क मैनेजर")}
            subtitle={x(
              "Create and track feed, delivery, farm and other tasks",
              "फीड, डिलीवरी, फार्म और अन्य टास्क बनाएं और ट्रैक करें"
            )}
            icon="checkbox"
            onPress={() => router.push("/tasks")}
          />
        ) : null}

        <ServiceCard
          title={t("services.profileTitle")}
          subtitle={t("services.profileSubtitle")}
          icon="person-circle"
          onPress={() => router.push("/profile")}
        />

        <ServiceCard
          title={x("Sync Center", "सिंक सेंटर")}
          subtitle={x("Offline queue monitor, retry and recovery", "ऑफलाइन कतार मॉनिटर, रीट्राई और रिकवरी")}
          icon="cloud-upload"
          onPress={() => router.push("/sync")}
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
