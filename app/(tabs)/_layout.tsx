import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs, usePathname } from "expo-router";
import { View } from "react-native";
import { DairyColors } from "../constants/dairy-theme";
import { DairyTypography } from "../constants/typography";
import { useAuth } from "../state/auth";
import { useI18n } from "../state/i18n";

function tabIcon(
  name: React.ComponentProps<typeof Ionicons>["name"],
  color: string,
  size: number | undefined,
  focused: boolean
) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: focused ? DairyColors.primarySoft : "transparent",
      }}
    >
      <Ionicons name={name} size={size ?? 20} color={color} />
    </View>
  );
}

export default function TabLayout() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const pathname = usePathname();

  if (loading) {
    return null;
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  const role = user.role;
  const isVet = user.role === "VET";
  const isDelivery = user.role === "DELIVERY";
  const isFeedManager = user.role === "FEED_MANAGER";
  const isOpsRole = user.role === "ADMIN" || user.role === "MANAGER" || user.role === "WORKER";
  const isAdmin = role === "ADMIN";
  const canClinical = role === "ADMIN" || role === "MANAGER" || role === "VET";
  const canSalesChecklist = isOpsRole || isDelivery;
  const canDeliveryOps = role === "ADMIN" || role === "MANAGER" || role === "DELIVERY";
  const canCustomerAccess = role === "ADMIN" || role === "MANAGER" || role === "WORKER" || role === "DELIVERY";
  const canEmployeesAccess = role === "ADMIN" || role === "MANAGER";
  const canStockAccess = role === "ADMIN" || role === "MANAGER" || role === "FEED_MANAGER";
  const canTaskManager = role === "ADMIN" || role === "MANAGER" || role === "FEED_MANAGER";
  const canWorklistAccess = role !== "DELIVERY" && role !== "VET";
  const routeRoot = (() => {
    const first = pathname.split("/").filter(Boolean)[0];
    return first ?? "index";
  })();
  const routeAllowed = (() => {
    if (routeRoot === "index") return true;
    if (routeRoot === "animals") return isOpsRole;
    if (routeRoot === "milk") return isOpsRole;
    if (routeRoot === "feed") return isOpsRole || isFeedManager;
    if (routeRoot === "qc") return isOpsRole;
    if (routeRoot === "health") return canClinical;
    if (routeRoot === "breeding") return canClinical;
    if (routeRoot === "treatments") return canClinical;
    if (routeRoot === "sales") return canSalesChecklist;
    if (routeRoot === "delivery-ops") return canDeliveryOps;
    if (routeRoot === "customers") return canCustomerAccess;
    if (routeRoot === "employees") return canEmployeesAccess;
    if (routeRoot === "expenses") return isAdmin;
    if (routeRoot === "stock") return canStockAccess;
    if (routeRoot === "tasks") return canTaskManager;
    if (routeRoot === "users") return isAdmin;
    if (routeRoot === "worklist") return canWorklistAccess;
    if (routeRoot === "today-tasks") return true;
    if (routeRoot === "services") return true;
    if (routeRoot === "settings") return true;
    if (routeRoot === "sync") return true;
    if (routeRoot === "profile") return true;
    return true;
  })();
  if (!routeAllowed) {
    return <Redirect href="/services" />;
  }

  const showDashboard = true;
  const showAnimals = isOpsRole;
  const showMilk = isOpsRole;
  const showFeed = isOpsRole || isFeedManager;
  const showQc = isOpsRole;
  const showHealthTab = isVet;
  const showTreatmentsTab = isVet;
  const showBreedingTab = isVet;
  const showSalesTab = isDelivery;

  return (
    <Tabs
      screenOptions={{
        headerTitleAlign: "center",
        headerStyle: { backgroundColor: DairyColors.surface },
        headerShadowVisible: false,
        headerTintColor: DairyColors.textPrimary,
        headerTitleStyle: {
          fontFamily: DairyTypography.fontFamily.heading,
          fontSize: DairyTypography.size.lg,
        },
        tabBarActiveTintColor: DairyColors.primary,
        tabBarInactiveTintColor: DairyColors.textSecondary,
        tabBarLabelStyle: {
          fontFamily: DairyTypography.fontFamily.label,
          fontSize: DairyTypography.size.xs,
          letterSpacing: 0.2,
          marginBottom: 2,
        },
        tabBarStyle: {
          height: 66,
          paddingTop: 6,
          paddingBottom: 8,
          borderTopWidth: 1,
          borderTopColor: DairyColors.border,
          backgroundColor: DairyColors.surface,
        },
        tabBarItemStyle: {
          borderRadius: 12,
          marginHorizontal: 2,
        },
        sceneStyle: { backgroundColor: DairyColors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.dashboard"),
          tabBarLabel: t("tabs.dashboard"),
          href: showDashboard ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => tabIcon("home", color, size, focused),
        }}
      />

      {/* IMPORTANT: bind to the nested index route */}
      <Tabs.Screen
        name="animals/index"
        options={{
          title: t("tabs.animals"),
          tabBarLabel: t("tabs.animals"),
          href: showAnimals ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => tabIcon("paw", color, size, focused),
        }}
      />

      <Tabs.Screen
        name="animals/[animalId]"
        options={{
          title: "Animal Details",
          href: null,
        }}
      />

      <Tabs.Screen
        name="milk/index"
        options={{
          title: t("tabs.milk"),
          tabBarLabel: t("tabs.milk"),
          href: showMilk ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => tabIcon("water", color, size, focused),
        }}
      />

      <Tabs.Screen
        name="feed/index"
        options={{
          title: t("tabs.feed"),
          tabBarLabel: t("tabs.feed"),
          href: showFeed ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => tabIcon("leaf", color, size, focused),
        }}
      />

      <Tabs.Screen
        name="qc/index"
        options={{
          title: t("tabs.qc"),
          tabBarLabel: t("tabs.qc"),
          href: showQc ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => tabIcon("flask", color, size, focused),
        }}
      />

      <Tabs.Screen
        name="employees/index"
        options={{
          title: t("tabs.employees"),
          href: null,
        }}
      />

      <Tabs.Screen
        name="customers/index"
        options={{
          title: "Customers",
          href: null,
        }}
      />

      <Tabs.Screen
        name="sales/index"
        options={{
          title: t("tabs.sales"),
          tabBarLabel: t("tabs.sales"),
          href: showSalesTab ? "/sales" : null,
          tabBarIcon: ({ color, size, focused }) => tabIcon("cart", color, size, focused),
        }}
      />

      <Tabs.Screen
        name="delivery-ops/index"
        options={{
          title: "Delivery Ops",
          href: null,
        }}
      />

      <Tabs.Screen
        name="expenses/index"
        options={{
          title: t("services.expensesTitle"),
          href: null,
        }}
      />

      <Tabs.Screen
        name="stock/index"
        options={{
          title: "Stock Manager",
          href: null,
        }}
      />

      <Tabs.Screen
        name="health/index"
        options={{
          title: t("tabs.health"),
          tabBarLabel: t("tabs.health"),
          href: showHealthTab ? "/health" : null,
          tabBarIcon: ({ color, size, focused }) => tabIcon("medkit", color, size, focused),
        }}
      />

      <Tabs.Screen
        name="breeding/index"
        options={{
          title: t("tabs.breeding"),
          tabBarLabel: t("tabs.breeding"),
          href: showBreedingTab ? "/breeding" : null,
          tabBarIcon: ({ color, size, focused }) => tabIcon("heart", color, size, focused),
        }}
      />

      <Tabs.Screen
        name="worklist/index"
        options={{
          title: t("tabs.worklist"),
          href: null,
        }}
      />

      <Tabs.Screen
        name="tasks/index"
        options={{
          title: "Task Manager",
          href: null,
        }}
      />

      <Tabs.Screen
        name="today-tasks/index"
        options={{
          title: "Today Tasks",
          href: null,
        }}
      />

      <Tabs.Screen
        name="treatments/index"
        options={{
          title: t("tabs.treatments"),
          tabBarLabel: t("tabs.treatments"),
          href: showTreatmentsTab ? "/treatments" : null,
          tabBarIcon: ({ color, size, focused }) => tabIcon("bandage", color, size, focused),
        }}
      />

      <Tabs.Screen
        name="services/index"
        options={{
          title: t("tabs.services"),
          tabBarLabel: t("tabs.services"),
          tabBarIcon: ({ color, size, focused }) => tabIcon("apps", color, size, focused),
        }}
      />

      <Tabs.Screen
        name="settings/index"
        options={{
          title: t("tabs.settings"),
          href: null,
        }}
      />

      <Tabs.Screen
        name="sync/index"
        options={{
          title: "Sync Center",
          href: null,
        }}
      />

      <Tabs.Screen
        name="profile/index"
        options={{
          title: t("tabs.profile"),
          href: null,
        }}
      />

      <Tabs.Screen
        name="users/index"
        options={{
          title: "User Management",
          href: null,
        }}
      />

      {/* Hide explore if it still exists */}
      <Tabs.Screen
        name="explore"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
