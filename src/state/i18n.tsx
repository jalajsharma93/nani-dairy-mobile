import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AppLanguage = "en" | "hi";
export type LabelGroup =
  | "role"
  | "animalStatus"
  | "employeeType"
  | "customerType"
  | "productType"
  | "paymentStatus"
  | "paymentMode"
  | "settlementCycle"
  | "expenseCategory"
  | "qcStatus"
  | "shift"
  | "dueFilter"
  | "breed";

const STORAGE_KEY = "nani_app_language";

const translations = {
  en: {
    "tabs.dashboard": "Dashboard",
    "tabs.animals": "Animals",
    "tabs.milk": "Milk",
    "tabs.feed": "Feed",
    "tabs.qc": "QC",
    "tabs.services": "Services",
    "tabs.employees": "Employees",
    "tabs.sales": "Sales",
    "tabs.health": "Animal Health",
    "tabs.breeding": "Breeding",
    "tabs.worklist": "Worklist",
    "tabs.treatments": "Treatments",
    "tabs.profile": "Profile",
    "tabs.settings": "Settings",

    "login.title": "NANI Dairy",
    "login.subtitle": "Sign in to continue",
    "login.username": "Username",
    "login.password": "Password",
    "login.signIn": "Sign In",
    "login.signingIn": "Signing in...",
    "login.demoUsers": "Demo Users",
    "login.missingTitle": "Missing details",
    "login.missingBody": "Username and password are required.",
    "login.failedTitle": "Login failed",
    "login.failedBody": "Could not login.",

    "services.title": "Services",
    "services.subtitle": "Access business modules used less frequently",
    "services.signOut": "Sign Out",
    "services.loggedInAs": "Logged in as",
    "services.coreInfo": "Core day-to-day tabs stay compact. Secondary modules live here.",
    "services.animalHealthTitle": "Animal Health",
    "services.animalHealthSubtitle": "Vaccination and deworming records",
    "services.breedingTitle": "Breeding",
    "services.breedingSubtitle": "Heat, insemination, pregnancy and calving tracking",
    "services.worklistTitle": "Today Worklist",
    "services.worklistSubtitle": "Auto alerts and action items for the day",
    "services.treatmentsTitle": "Medical Treatment",
    "services.treatmentsSubtitle": "Log per-animal treatment and follow-up records",
    "services.employeesTitle": "Employees",
    "services.employeesSubtitle": "Manage worker records, status, and updates",
    "services.salesTitle": "Sales",
    "services.salesSubtitle": "Record dispatch, payments, and customer ledger",
    "services.expensesTitle": "Expenses",
    "services.expensesSubtitle": "Track farm expenses including salary payments",
    "services.profileTitle": "Profile",
    "services.profileSubtitle": "Open profile, permissions, and app settings",
    "services.settingsTitle": "Settings",
    "services.settingsSubtitle": "Language and app preferences",
    "services.signOutSubtitle": "Switch account and login as another user",

    "profile.title": "Profile",
    "profile.subtitle": "User account and access setup",
    "profile.rolePermissions": "Role & Permissions",
    "profile.role": "Role",
    "profile.roleDesc": "Role-based access is now active and will be expanded in upcoming screens.",
    "profile.settings": "Settings",
    "profile.accountDetails": "Account Details",
    "profile.accountDetailsSub": "Name, contact info, and farm metadata",
    "profile.notifications": "Notifications",
    "profile.notificationsSub": "Alerts for QC, payments, and reminders",
    "profile.security": "Security & Login",
    "profile.securitySub": "Password, session and device controls",
    "profile.backup": "Data & Backup",
    "profile.backupSub": "Export reports and backup sync options",
    "profile.preferences": "Theme & App Preferences",
    "profile.preferencesSub": "Language, display and behavior preferences",
    "profile.signOut": "Sign Out",
    "profile.signOutSub": "End current session on this device",
    "profile.comingSoon": "Coming Soon",
    "profile.settingsFuture": "settings will be wired after auth/settings backend is ready.",

    "settings.title": "Settings",
    "settings.subtitle": "Choose app language and preferences",
    "settings.languageTitle": "Language",
    "settings.languageSubtitle": "Select your preferred app language",
    "settings.english": "English",
    "settings.hindi": "हिंदी",
    "settings.current": "Current",

    "common.unknown": "Unknown",
    "common.readOnly": "Read-only mode",
    "common.readOnlyDesc": "You can view records, but add/edit/delete is restricted for your role.",
    "common.addRestricted": "Add is restricted to ADMIN/MANAGER.",
    "common.manageRestricted": "This action is restricted to ADMIN/MANAGER.",
  },
  hi: {
    "tabs.dashboard": "डैशबोर्ड",
    "tabs.animals": "जानवर",
    "tabs.milk": "दूध",
    "tabs.feed": "चारा",
    "tabs.qc": "क्वालिटी",
    "tabs.services": "सेवाएं",
    "tabs.employees": "कर्मचारी",
    "tabs.sales": "बिक्री",
    "tabs.health": "जानवरों की सेहत",
    "tabs.breeding": "प्रजनन",
    "tabs.worklist": "आज के काम",
    "tabs.treatments": "ट्रीटमेंट",
    "tabs.profile": "प्रोफाइल",
    "tabs.settings": "सेटिंग्स",

    "login.title": "नानी डेयरी",
    "login.subtitle": "आगे बढ़ने के लिए लॉगिन करें",
    "login.username": "यूज़रनेम",
    "login.password": "पासवर्ड",
    "login.signIn": "लॉगिन",
    "login.signingIn": "लॉगिन हो रहा है...",
    "login.demoUsers": "टेस्ट यूज़र",
    "login.missingTitle": "जानकारी पूरी करें",
    "login.missingBody": "यूज़रनेम और पासवर्ड डालना जरूरी है।",
    "login.failedTitle": "लॉगिन नहीं हुआ",
    "login.failedBody": "कृपया फिर से कोशिश करें।",

    "services.title": "सेवाएं",
    "services.subtitle": "कम इस्तेमाल वाले फीचर यहां मिलेंगे",
    "services.signOut": "लॉगआउट",
    "services.loggedInAs": "लॉगिन यूज़र",
    "services.coreInfo": "रोज के जरूरी टैब नीचे हैं, बाकी फीचर यहां रखे हैं।",
    "services.animalHealthTitle": "जानवरों की सेहत",
    "services.animalHealthSubtitle": "टीका और पेट की दवा का रिकॉर्ड",
    "services.breedingTitle": "प्रजनन",
    "services.breedingSubtitle": "हीट, इंसेमिनेशन, गाभिन जांच और बछड़ा रिकॉर्ड",
    "services.worklistTitle": "आज की काम सूची",
    "services.worklistSubtitle": "आज के अलर्ट और जरूरी काम",
    "services.treatmentsTitle": "मेडिकल ट्रीटमेंट",
    "services.treatmentsSubtitle": "हर जानवर का इलाज और फॉलो-अप रिकॉर्ड",
    "services.employeesTitle": "कर्मचारी",
    "services.employeesSubtitle": "कर्मचारियों की जानकारी और स्थिति",
    "services.salesTitle": "बिक्री",
    "services.salesSubtitle": "बिक्री, भुगतान और ग्राहक हिसाब",
    "services.expensesTitle": "खर्चे",
    "services.expensesSubtitle": "फार्म के खर्चे दर्ज करें, सैलरी सहित",
    "services.profileTitle": "प्रोफाइल",
    "services.profileSubtitle": "आपकी प्रोफाइल और अनुमति",
    "services.settingsTitle": "सेटिंग्स",
    "services.settingsSubtitle": "भाषा और ऐप की पसंद",
    "services.signOutSubtitle": "दूसरे यूज़र से लॉगिन करने के लिए",

    "profile.title": "प्रोफाइल",
    "profile.subtitle": "यूज़र अकाउंट और एक्सेस",
    "profile.rolePermissions": "भूमिका और अनुमति",
    "profile.role": "भूमिका",
    "profile.roleDesc": "रोल के हिसाब से एक्सेस चालू है, आगे और जगह लागू होगा।",
    "profile.settings": "सेटिंग्स",
    "profile.accountDetails": "अकाउंट जानकारी",
    "profile.accountDetailsSub": "नाम, मोबाइल और फार्म की जानकारी",
    "profile.notifications": "नोटिफिकेशन",
    "profile.notificationsSub": "क्वालिटी, भुगतान और रिमाइंडर अलर्ट",
    "profile.security": "सुरक्षा और लॉगिन",
    "profile.securitySub": "पासवर्ड, सेशन और डिवाइस कंट्रोल",
    "profile.backup": "डेटा और बैकअप",
    "profile.backupSub": "रिपोर्ट डाउनलोड और बैकअप विकल्प",
    "profile.preferences": "थीम और ऐप सेटिंग्स",
    "profile.preferencesSub": "भाषा, डिस्प्ले और ऐप व्यवहार",
    "profile.signOut": "लॉगआउट",
    "profile.signOutSub": "इस डिवाइस से अभी का सेशन बंद करें",
    "profile.comingSoon": "जल्द आएगा",
    "profile.settingsFuture": "ये सेटिंग्स जल्द जोड़ दी जाएंगी।",

    "settings.title": "सेटिंग्स",
    "settings.subtitle": "ऐप की भाषा और पसंद चुनें",
    "settings.languageTitle": "भाषा",
    "settings.languageSubtitle": "जिस भाषा में ऐप चाहिए, वो चुनें",
    "settings.english": "English",
    "settings.hindi": "हिंदी",
    "settings.current": "अभी चुनी हुई",

    "common.unknown": "अज्ञात",
    "common.readOnly": "सिर्फ देखने का मोड",
    "common.readOnlyDesc": "आप रिकॉर्ड देख सकते हैं, लेकिन जोड़ना/बदलना/हटाना आपके रोल में अनुमति नहीं है।",
    "common.addRestricted": "जोड़ने की अनुमति सिर्फ ADMIN/MANAGER को है।",
    "common.manageRestricted": "यह काम सिर्फ ADMIN/MANAGER कर सकता है।",
  },
} as const;

type TranslationKey = keyof (typeof translations)["en"];

const labelMap = {
  en: {
    role: {
      ADMIN: "Admin",
      MANAGER: "Manager",
      WORKER: "Worker",
      FEED_MANAGER: "Feed Manager",
      DELIVERY: "Delivery",
      VET: "Vet",
    },
    animalStatus: {
      LACTATING: "Lactating",
      DRY: "Dry",
      SICK: "Sick",
      SOLD: "Sold",
    },
    employeeType: {
      FULL_TIME: "Full-time",
      PART_TIME: "Part-time",
    },
    customerType: {
      COOPERATIVE: "Cooperative",
      RETAIL: "Retail",
      INDIVIDUAL: "Individual",
    },
    productType: {
      MILK: "Milk",
      GHEE: "Ghee",
      CURD: "Curd",
      PANEER: "Paneer",
      BUTTERMILK: "Buttermilk",
      DUNG: "Dung",
      COMPOST: "Compost",
    },
    paymentStatus: {
      PAID: "Paid",
      PARTIAL: "Partial",
      UNPAID: "Unpaid",
      PENDING: "Pending",
    },
    paymentMode: {
      CASH: "Cash",
      UPI: "UPI",
      BANK_TRANSFER: "Bank Transfer",
      CARD: "Card",
      CREDIT: "Credit",
    },
    settlementCycle: {
      DAILY: "Daily",
      WEEKLY: "Weekly",
      FORTNIGHTLY: "Fortnightly",
      MONTHLY: "Monthly",
    },
    expenseCategory: {
      SALARY: "Salary",
      FEED: "Feed",
      VETERINARY: "Veterinary",
      ELECTRICITY: "Electricity",
      WATER: "Water",
      EQUIPMENT: "Equipment",
      MAINTENANCE: "Maintenance",
      TRANSPORT: "Transport",
      MISC: "Misc",
    },
    qcStatus: {
      PASS: "Pass",
      HOLD: "Hold",
      REJECT: "Reject",
      PENDING: "Pending",
      NO_BATCH: "No Batch",
    },
    shift: {
      AM: "AM",
      PM: "PM",
      AM_SHIFT: "AM Shift",
      PM_SHIFT: "PM Shift",
    },
    dueFilter: {
      ALL: "All",
      DUE_TODAY: "Due Today",
      DUE_SOON: "Due Soon",
      OVERDUE: "Overdue",
      OK: "OK",
    },
    breed: {
      Gir: "Gir",
      Sahiwal: "Sahiwal",
      Desi: "Desi",
      Jersey: "Jersey",
      HF: "HF",
      Buffalo: "Buffalo",
      Other: "Other",
    },
  },
  hi: {
    role: {
      ADMIN: "एडमिन",
      MANAGER: "मैनेजर",
      WORKER: "कर्मचारी",
      FEED_MANAGER: "फीड मैनेजर",
      DELIVERY: "डिलीवरी",
      VET: "पशु डॉक्टर",
    },
    animalStatus: {
      LACTATING: "दूध दे रहा",
      DRY: "सूखा",
      SICK: "बीमार",
      SOLD: "बेचा गया",
    },
    employeeType: {
      FULL_TIME: "फुल-टाइम",
      PART_TIME: "पार्ट-टाइम",
    },
    customerType: {
      COOPERATIVE: "कोऑपरेटिव",
      RETAIL: "रिटेल",
      INDIVIDUAL: "व्यक्तिगत",
    },
    productType: {
      MILK: "दूध",
      GHEE: "घी",
      CURD: "दही",
      PANEER: "पनीर",
      BUTTERMILK: "छाछ",
      DUNG: "गोबर",
      COMPOST: "कम्पोस्ट",
    },
    paymentStatus: {
      PAID: "भुगतान पूरा",
      PARTIAL: "आंशिक भुगतान",
      UNPAID: "बकाया",
      PENDING: "बाकी भुगतान",
    },
    paymentMode: {
      CASH: "नकद",
      UPI: "यूपीआई",
      BANK_TRANSFER: "बैंक ट्रांसफर",
      CARD: "कार्ड",
      CREDIT: "उधार",
    },
    settlementCycle: {
      DAILY: "दैनिक",
      WEEKLY: "साप्ताहिक",
      FORTNIGHTLY: "पाक्षिक",
      MONTHLY: "मासिक",
    },
    expenseCategory: {
      SALARY: "सैलरी",
      FEED: "चारा",
      VETERINARY: "पशु चिकित्सा",
      ELECTRICITY: "बिजली",
      WATER: "पानी",
      EQUIPMENT: "उपकरण",
      MAINTENANCE: "मेंटेनेंस",
      TRANSPORT: "परिवहन",
      MISC: "अन्य",
    },
    qcStatus: {
      PASS: "पास",
      HOLD: "होल्ड",
      REJECT: "रिजेक्ट",
      PENDING: "पेंडिंग",
      NO_BATCH: "बैच नहीं",
    },
    shift: {
      AM: "सुबह",
      PM: "शाम",
      AM_SHIFT: "सुबह शिफ्ट",
      PM_SHIFT: "शाम शिफ्ट",
    },
    dueFilter: {
      ALL: "सभी",
      DUE_TODAY: "आज देय",
      DUE_SOON: "जल्द देय",
      OVERDUE: "समय से बाकी",
      OK: "ठीक",
    },
    breed: {
      Gir: "गिर",
      Sahiwal: "साहीवाल",
      Desi: "देसी",
      Jersey: "जर्सी",
      HF: "एचएफ",
      Buffalo: "भैंस",
      Other: "अन्य",
    },
  },
} as const;

type I18nContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (key: TranslationKey) => string;
  x: (english: string, hindi: string) => string;
  label: (group: LabelGroup, value: string) => string;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function getInitialLanguage(): AppLanguage {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "hi") {
      return stored;
    }
  }
  return "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage>(getInitialLanguage);

  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, language);
    }
  }, [language]);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key: TranslationKey) => translations[language][key] ?? translations.en[key] ?? key,
      x: (english: string, hindi: string) => (language === "hi" ? hindi : english),
      label: (group: LabelGroup, value: string) =>
        (labelMap[language][group] as Record<string, string>)[value] ??
        (labelMap.en[group] as Record<string, string>)[value] ??
        value,
    }),
    [language]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}
