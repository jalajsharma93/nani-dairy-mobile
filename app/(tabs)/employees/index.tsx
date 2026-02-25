import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Switch, Text, TextInput, View } from "react-native";
import {
  EmployeeApi,
  EmployeeGovernmentIdType,
  EmployeeResponse,
  EmployeeType,
  ExpenseApi,
  PaymentMode,
} from "../../services/api";
import { DairyColors } from "../../constants/dairy-theme";
import { useAuth } from "../../state/auth";
import { useI18n } from "../../state/i18n";
import { todayLocalISO } from "../../utils/date";

const TYPE_OPTIONS: EmployeeType[] = ["FULL_TIME", "PART_TIME"];
const GOVT_ID_OPTIONS: EmployeeGovernmentIdType[] = [
  "AADHAAR",
  "PAN",
  "VOTER_ID",
  "DRIVING_LICENSE",
  "PASSPORT",
  "OTHER",
];
const PAYMENT_MODES: PaymentMode[] = ["CASH", "UPI", "BANK_TRANSFER", "CARD", "CREDIT"];

function employeeTypeTone(type: EmployeeType) {
  if (type === "FULL_TIME") {
    return { text: DairyColors.success, background: DairyColors.successSoft };
  }
  return { text: DairyColors.info, background: DairyColors.infoSoft };
}

function normalizeOptionalInput(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function maskLast4(value?: string | null) {
  if (!value) {
    return "-";
  }
  const cleaned = value.replace(/\s+/g, "");
  if (cleaned.length <= 4) {
    return cleaned;
  }
  return `${"*".repeat(cleaned.length - 4)}${cleaned.slice(-4)}`;
}

function maskLast3(value?: string | null) {
  if (!value) {
    return "-";
  }
  const cleaned = value.replace(/\s+/g, "");
  if (cleaned.length <= 3) {
    return cleaned;
  }
  return `${"*".repeat(cleaned.length - 3)}${cleaned.slice(-3)}`;
}

export default function EmployeesScreen() {
  const { hasAnyRole } = useAuth();
  const { x, label } = useI18n();
  const canManageEmployees = hasAnyRole("ADMIN");

  const [employees, setEmployees] = useState<EmployeeResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [salaryEmployee, setSalaryEmployee] = useState<EmployeeResponse | null>(null);
  const [salaryDate, setSalaryDate] = useState(todayLocalISO());
  const [salaryAmount, setSalaryAmount] = useState("");
  const [salaryPaymentMode, setSalaryPaymentMode] = useState<PaymentMode>("UPI");
  const [salaryReferenceNo, setSalaryReferenceNo] = useState("");
  const [salaryNotes, setSalaryNotes] = useState("");
  const [salarySaving, setSalarySaving] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [joinDate, setJoinDate] = useState(todayLocalISO());
  const [governmentIdType, setGovernmentIdType] = useState<EmployeeGovernmentIdType>("AADHAAR");
  const [governmentIdNumber, setGovernmentIdNumber] = useState("");
  const [address, setAddress] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [uan, setUan] = useState("");
  const [esicIpNumber, setEsicIpNumber] = useState("");
  const [type, setType] = useState<EmployeeType>("FULL_TIME");
  const [isActive, setIsActive] = useState(true);

  const governmentIdTypeLabel = (idType: EmployeeGovernmentIdType) => {
    if (idType === "AADHAAR") return x("Aadhaar", "आधार");
    if (idType === "PAN") return x("PAN", "पैन");
    if (idType === "VOTER_ID") return x("Voter ID", "मतदाता पहचान");
    if (idType === "DRIVING_LICENSE") return x("Driving License", "ड्राइविंग लाइसेंस");
    if (idType === "PASSPORT") return x("Passport", "पासपोर्ट");
    return x("Other", "अन्य");
  };

  const paymentModeLabel = (mode: PaymentMode) => label("paymentMode", mode);

  const loadEmployees = useCallback(async () => {
    try {
      setLoading(true);
      setEmployees(await EmployeeApi.list());
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load employees.", "कर्मचारियों की जानकारी लोड नहीं हो पाई।")
      );
    } finally {
      setLoading(false);
    }
  }, [x]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const resetForm = () => {
    setEditingEmployeeId(null);
    setName("");
    setPhone("");
    setRoleTitle("");
    setJoinDate(todayLocalISO());
    setGovernmentIdType("AADHAAR");
    setGovernmentIdNumber("");
    setAddress("");
    setEmergencyContactName("");
    setEmergencyContactPhone("");
    setBankAccountNumber("");
    setIfscCode("");
    setUan("");
    setEsicIpNumber("");
    setType("FULL_TIME");
    setIsActive(true);
    setShowForm(false);
  };

  const openAddForm = () => {
    if (!canManageEmployees) {
      Alert.alert(
        x("Admin only", "सिर्फ एडमिन"),
        x("Only ADMIN users can add or update employees.", "कर्मचारी जोड़ना/बदलना सिर्फ ADMIN कर सकता है।")
      );
      return;
    }
    setEditingEmployeeId(null);
    setName("");
    setPhone("");
    setRoleTitle("");
    setJoinDate(todayLocalISO());
    setGovernmentIdType("AADHAAR");
    setGovernmentIdNumber("");
    setAddress("");
    setEmergencyContactName("");
    setEmergencyContactPhone("");
    setBankAccountNumber("");
    setIfscCode("");
    setUan("");
    setEsicIpNumber("");
    setType("FULL_TIME");
    setIsActive(true);
    setShowForm(true);
  };

  const submitEmployee = async () => {
    if (!canManageEmployees) {
      Alert.alert(
        x("Admin only", "सिर्फ एडमिन"),
        x("Only ADMIN users can add or update employees.", "कर्मचारी जोड़ना/बदलना सिर्फ ADMIN कर सकता है।")
      );
      return;
    }

    if (!name.trim()) {
      Alert.alert(x("Missing details", "जानकारी अधूरी"), x("Name is required.", "नाम डालना जरूरी है।"));
      return;
    }

    if (!/^\d{10}$/.test(phone.trim())) {
      Alert.alert(
        x("Invalid phone", "गलत फोन नंबर"),
        x("Phone must be 10 digits.", "फोन नंबर 10 अंकों का होना चाहिए।")
      );
      return;
    }

    if (!roleTitle.trim()) {
      Alert.alert(
        x("Missing details", "जानकारी अधूरी"),
        x("Role/title is required.", "काम/पद का नाम जरूरी है।")
      );
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(joinDate.trim())) {
      Alert.alert(
        x("Invalid date", "गलत तारीख"),
        x("Join date must be in YYYY-MM-DD format.", "जॉइन तारीख YYYY-MM-DD में डालें।")
      );
      return;
    }

    if (!governmentIdNumber.trim()) {
      Alert.alert(
        x("Missing details", "जानकारी अधूरी"),
        x("Government ID number is required.", "सरकारी पहचान नंबर जरूरी है।")
      );
      return;
    }

    if (emergencyContactPhone.trim() && !/^\d{10}$/.test(emergencyContactPhone.trim())) {
      Alert.alert(
        x("Invalid emergency phone", "गलत आपातकालीन फोन"),
        x("Emergency contact phone must be 10 digits.", "आपातकालीन फोन 10 अंकों का होना चाहिए।")
      );
      return;
    }

    if (uan.trim() && !/^\d{12}$/.test(uan.trim())) {
      Alert.alert(
        x("Invalid UAN", "गलत UAN"),
        x("UAN must be 12 digits.", "UAN 12 अंकों का होना चाहिए।")
      );
      return;
    }

    if (esicIpNumber.trim() && !/^\d{10}$/.test(esicIpNumber.trim())) {
      Alert.alert(
        x("Invalid ESIC", "गलत ESIC"),
        x("ESIC IP number must be 10 digits.", "ESIC IP नंबर 10 अंकों का होना चाहिए।")
      );
      return;
    }

    try {
      setSaving(true);
      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        roleTitle: roleTitle.trim(),
        joinDate: joinDate.trim(),
        governmentIdType,
        governmentIdNumber: governmentIdNumber.trim().toUpperCase(),
        address: normalizeOptionalInput(address),
        emergencyContactName: normalizeOptionalInput(emergencyContactName),
        emergencyContactPhone: normalizeOptionalInput(emergencyContactPhone),
        bankAccountNumber: normalizeOptionalInput(bankAccountNumber),
        ifscCode: normalizeOptionalInput(ifscCode)?.toUpperCase() ?? null,
        uan: normalizeOptionalInput(uan),
        esicIpNumber: normalizeOptionalInput(esicIpNumber),
        type,
        isActive,
      };

      if (editingEmployeeId) {
        await EmployeeApi.update(editingEmployeeId, payload);
      } else {
        await EmployeeApi.create(payload);
      }

      await loadEmployees();
      resetForm();
      Alert.alert(
        x("Saved", "सेव हो गया"),
        editingEmployeeId ? x("Employee updated.", "कर्मचारी अपडेट हो गया।") : x("Employee added.", "कर्मचारी जोड़ दिया गया।")
      );
    } catch (e: any) {
      console.error(e);
      const message = String(e?.message ?? x("Could not save employee.", "कर्मचारी सेव नहीं हो पाया।"));
      if (message.includes("HTTP 403")) {
        Alert.alert(
          x("Role restricted", "रोल अनुमति नहीं"),
          x("Only ADMIN users can add or update employees.", "कर्मचारी जोड़ना/बदलना सिर्फ ADMIN कर सकता है।")
        );
      } else {
        Alert.alert(x("Save failed", "सेव नहीं हुआ"), message);
      }
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (employee: EmployeeResponse) => {
    if (!canManageEmployees) {
      Alert.alert(
        x("Role restricted", "रोल अनुमति नहीं"),
        x("Only ADMIN users can add or update employees.", "कर्मचारी जोड़ना/बदलना सिर्फ ADMIN कर सकता है।")
      );
      return;
    }

    setEditingEmployeeId(employee.employeeId);
    setName(employee.name);
    setPhone(employee.phone ?? "");
    setRoleTitle(employee.roleTitle ?? "");
    setJoinDate(employee.joinDate ?? todayLocalISO());
    setGovernmentIdType(employee.governmentIdType ?? "AADHAAR");
    setGovernmentIdNumber(employee.governmentIdNumber ?? "");
    setAddress(employee.address ?? "");
    setEmergencyContactName(employee.emergencyContactName ?? "");
    setEmergencyContactPhone(employee.emergencyContactPhone ?? "");
    setBankAccountNumber(employee.bankAccountNumber ?? "");
    setIfscCode(employee.ifscCode ?? "");
    setUan(employee.uan ?? "");
    setEsicIpNumber(employee.esicIpNumber ?? "");
    setType(employee.type);
    setIsActive(employee.isActive);
    setShowForm(true);
  };

  const summary = useMemo(() => {
    const total = employees.length;
    const fullTime = employees.filter((e) => e.type === "FULL_TIME").length;
    const active = employees.filter((e) => e.isActive).length;
    return { total, fullTime, active };
  }, [employees]);

  const resetSalaryForm = () => {
    setSalaryEmployee(null);
    setSalaryDate(todayLocalISO());
    setSalaryAmount("");
    setSalaryPaymentMode("UPI");
    setSalaryReferenceNo("");
    setSalaryNotes("");
  };

  const openSalaryForm = (employee: EmployeeResponse) => {
    if (!canManageEmployees) {
      return;
    }
    setSalaryEmployee(employee);
    setSalaryDate(todayLocalISO());
    setSalaryAmount("");
    setSalaryPaymentMode("UPI");
    setSalaryReferenceNo("");
    setSalaryNotes("");
  };

  const saveSalaryPayment = async () => {
    if (!canManageEmployees || !salaryEmployee) {
      Alert.alert(
        x("Admin only", "सिर्फ एडमिन"),
        x("Only ADMIN users can record salary payments.", "सैलरी भुगतान रिकॉर्ड सिर्फ ADMIN कर सकता है।")
      );
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(salaryDate.trim())) {
      Alert.alert(
        x("Invalid date", "गलत तारीख"),
        x("Payment date must be in YYYY-MM-DD format.", "भुगतान तारीख YYYY-MM-DD में डालें।")
      );
      return;
    }

    const amountValue = Number(salaryAmount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      Alert.alert(
        x("Invalid amount", "गलत राशि"),
        x("Salary amount must be a positive number.", "सैलरी राशि पॉजिटिव संख्या होनी चाहिए।")
      );
      return;
    }

    try {
      setSalarySaving(true);
      const details = [`Employee ID: ${salaryEmployee.employeeId}`];
      if (salaryEmployee.roleTitle) {
        details.push(`Role: ${salaryEmployee.roleTitle}`);
      }
      if (salaryNotes.trim()) {
        details.push(salaryNotes.trim());
      }

      await ExpenseApi.create({
        expenseDate: salaryDate.trim(),
        category: "SALARY",
        amount: amountValue,
        paymentMode: salaryPaymentMode,
        counterparty: salaryEmployee.name,
        referenceNo: salaryReferenceNo.trim() || null,
        notes: details.join(" | "),
      });

      Alert.alert(
        x("Salary recorded", "सैलरी रिकॉर्ड हो गई"),
        x("Salary payment has been added to expenses.", "सैलरी भुगतान खर्चे में जोड़ दिया गया।")
      );
      resetSalaryForm();
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not record salary payment.", "सैलरी भुगतान रिकॉर्ड नहीं हो पाया।")
      );
    } finally {
      setSalarySaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: DairyColors.background }}>
      <FlatList
        data={employees}
        keyExtractor={(e) => e.employeeId}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponent={
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={{ fontSize: 24, fontWeight: "800", color: DairyColors.textPrimary }}>
                  {x("Employees", "कर्मचारी")}
                </Text>
                <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                  {x("Workforce and role coverage", "स्टाफ और भूमिका कवरेज")}
                </Text>
              </View>
              <Pressable
                onPress={loadEmployees}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  backgroundColor: DairyColors.surface,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={loading ? "sync-circle" : "refresh"} size={20} color={DairyColors.primary} />
              </Pressable>
            </View>

            {canManageEmployees ? (
              <Pressable
                onPress={openAddForm}
                style={{
                  marginTop: 12,
                  backgroundColor: DairyColors.primary,
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Ionicons name="person-add" size={18} color="white" />
                <Text style={{ color: "white", fontWeight: "800" }}>{x("Add Employee", "कर्मचारी जोड़ें")}</Text>
              </Pressable>
            ) : null}

            <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <View style={{ flex: 1, minWidth: 100, backgroundColor: DairyColors.accentSoft, borderRadius: 12, padding: 10 }}>
                <Text style={{ color: DairyColors.textSecondary }}>{x("Total", "कुल")}</Text>
                <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>{summary.total}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 100, backgroundColor: DairyColors.infoSoft, borderRadius: 12, padding: 10 }}>
                <Text style={{ color: DairyColors.textSecondary }}>{x("Full-time", "फुल-टाइम")}</Text>
                <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>{summary.fullTime}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 100, backgroundColor: DairyColors.successSoft, borderRadius: 12, padding: 10 }}>
                <Text style={{ color: DairyColors.textSecondary }}>{x("Active", "सक्रिय")}</Text>
                <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800", fontSize: 18 }}>{summary.active}</Text>
              </View>
            </View>

            {salaryEmployee ? (
              <View
                style={{
                  marginTop: 14,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  borderRadius: 14,
                  padding: 14,
                  backgroundColor: DairyColors.surface,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "800", fontSize: 16 }}>
                  {x("Record Salary Payment", "सैलरी भुगतान दर्ज करें")}
                </Text>
                <Text style={{ marginTop: 6, color: DairyColors.textSecondary }}>
                  {x("Employee", "कर्मचारी")}: {salaryEmployee.name} ({salaryEmployee.employeeId})
                </Text>

                <TextInput
                  style={{
                    marginTop: 10,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 11,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surfaceMuted,
                  }}
                  placeholder={x("Payment date (YYYY-MM-DD)", "भुगतान तारीख (YYYY-MM-DD)")}
                  placeholderTextColor="#99A99A"
                  value={salaryDate}
                  onChangeText={setSalaryDate}
                />

                <TextInput
                  style={{
                    marginTop: 8,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 11,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surfaceMuted,
                  }}
                  placeholder={x("Salary amount", "सैलरी राशि")}
                  placeholderTextColor="#99A99A"
                  keyboardType="decimal-pad"
                  value={salaryAmount}
                  onChangeText={setSalaryAmount}
                />

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Payment Mode", "भुगतान तरीका")}
                </Text>
                <View style={{ marginTop: 6, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {PAYMENT_MODES.map((option) => (
                    <Pressable
                      key={option}
                      onPress={() => setSalaryPaymentMode(option)}
                      style={{
                        borderWidth: 1,
                        borderColor: salaryPaymentMode === option ? DairyColors.primary : DairyColors.border,
                        backgroundColor: salaryPaymentMode === option ? DairyColors.primarySoft : DairyColors.surface,
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                      }}
                    >
                      <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{paymentModeLabel(option)}</Text>
                    </Pressable>
                  ))}
                </View>

                <TextInput
                  style={{
                    marginTop: 8,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 11,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surfaceMuted,
                  }}
                  placeholder={x("Reference no (optional)", "रेफरेंस नंबर (वैकल्पिक)")}
                  placeholderTextColor="#99A99A"
                  value={salaryReferenceNo}
                  onChangeText={setSalaryReferenceNo}
                />

                <TextInput
                  style={{
                    marginTop: 8,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 11,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surfaceMuted,
                  }}
                  placeholder={x("Notes (optional)", "नोट्स (वैकल्पिक)")}
                  placeholderTextColor="#99A99A"
                  value={salaryNotes}
                  onChangeText={setSalaryNotes}
                />

                <Pressable
                  disabled={salarySaving}
                  onPress={saveSalaryPayment}
                  style={{
                    marginTop: 10,
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: salarySaving ? DairyColors.textSecondary : DairyColors.primary,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "800" }}>
                    {salarySaving ? x("Saving...", "सेव हो रहा है...") : x("Record Salary Payment", "सैलरी भुगतान दर्ज करें")}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={resetSalaryForm}
                  style={{
                    marginTop: 8,
                    padding: 11,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    alignItems: "center",
                    backgroundColor: DairyColors.surface,
                  }}
                >
                  <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>{x("Cancel", "रद्द करें")}</Text>
                </Pressable>
              </View>
            ) : null}

            {showForm ? (
              <View
                style={{
                  marginTop: 14,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  borderRadius: 14,
                  padding: 14,
                  backgroundColor: DairyColors.surface,
                }}
              >
                <Text style={{ fontWeight: "800", color: DairyColors.textPrimary, fontSize: 16 }}>
                  {editingEmployeeId ? x("Edit Employee", "कर्मचारी बदलें") : x("Add Employee", "कर्मचारी जोड़ें")}
                </Text>

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Name", "नाम")}
                </Text>
                <TextInput
                  style={{
                    marginTop: 6,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 11,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surfaceMuted,
                  }}
                  placeholder={x("Employee name", "कर्मचारी का नाम")}
                  placeholderTextColor="#99A99A"
                  value={name}
                  onChangeText={setName}
                />

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Phone", "फोन")}
                </Text>
                <TextInput
                  style={{
                    marginTop: 6,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 11,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surfaceMuted,
                  }}
                  placeholder={x("10-digit mobile number", "10 अंकों का मोबाइल नंबर")}
                  placeholderTextColor="#99A99A"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Role/Work", "काम/पद")}
                </Text>
                <TextInput
                  style={{
                    marginTop: 6,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 11,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surfaceMuted,
                  }}
                  placeholder={x("e.g., Milker / Cleaner / Supervisor", "जैसे मिल्कर / क्लीनर / सुपरवाइजर")}
                  placeholderTextColor="#99A99A"
                  value={roleTitle}
                  onChangeText={setRoleTitle}
                />

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Type", "प्रकार")}
                </Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                  {TYPE_OPTIONS.map((option) => {
                    const tone = employeeTypeTone(option);
                    const selected = type === option;
                    return (
                      <Pressable
                        key={option}
                        onPress={() => setType(option)}
                        style={{
                          borderWidth: 1,
                          borderColor: selected ? tone.text : DairyColors.border,
                          backgroundColor: selected ? tone.background : DairyColors.surface,
                          borderRadius: 999,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                        }}
                      >
                        <Text style={{ color: selected ? tone.text : DairyColors.textPrimary, fontWeight: "700" }}>
                          {label("employeeType", option)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Joining Date", "जॉइन तारीख")}
                </Text>
                <TextInput
                  style={{
                    marginTop: 6,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 11,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surfaceMuted,
                  }}
                  placeholder={x("YYYY-MM-DD", "YYYY-MM-DD")}
                  placeholderTextColor="#99A99A"
                  value={joinDate}
                  onChangeText={setJoinDate}
                />

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Government ID Type", "सरकारी पहचान प्रकार")}
                </Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                  {GOVT_ID_OPTIONS.map((option) => {
                    const selected = governmentIdType === option;
                    return (
                      <Pressable
                        key={option}
                        onPress={() => setGovernmentIdType(option)}
                        style={{
                          borderWidth: 1,
                          borderColor: selected ? DairyColors.primary : DairyColors.border,
                          backgroundColor: selected ? DairyColors.primarySoft : DairyColors.surface,
                          borderRadius: 999,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                        }}
                      >
                        <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                          {governmentIdTypeLabel(option)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("ID Number", "पहचान नंबर")}
                </Text>
                <TextInput
                  style={{
                    marginTop: 6,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 11,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surfaceMuted,
                  }}
                  placeholder={x("Enter ID number", "पहचान नंबर डालें")}
                  placeholderTextColor="#99A99A"
                  value={governmentIdNumber}
                  onChangeText={setGovernmentIdNumber}
                  autoCapitalize="characters"
                />

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Address (optional)", "पता (वैकल्पिक)")}
                </Text>
                <TextInput
                  style={{
                    marginTop: 6,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 11,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surfaceMuted,
                  }}
                  placeholder={x("Village/Area/City", "गांव/इलाका/शहर")}
                  placeholderTextColor="#99A99A"
                  value={address}
                  onChangeText={setAddress}
                />

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Emergency Contact Name (optional)", "आपातकालीन संपर्क नाम (वैकल्पिक)")}
                </Text>
                <TextInput
                  style={{
                    marginTop: 6,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 11,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surfaceMuted,
                  }}
                  placeholder={x("Emergency contact person", "आपातकालीन व्यक्ति का नाम")}
                  placeholderTextColor="#99A99A"
                  value={emergencyContactName}
                  onChangeText={setEmergencyContactName}
                />

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Emergency Contact Phone (optional)", "आपातकालीन फोन (वैकल्पिक)")}
                </Text>
                <TextInput
                  style={{
                    marginTop: 6,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 11,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surfaceMuted,
                  }}
                  placeholder={x("10-digit emergency number", "10 अंकों का आपातकालीन नंबर")}
                  placeholderTextColor="#99A99A"
                  value={emergencyContactPhone}
                  onChangeText={setEmergencyContactPhone}
                  keyboardType="phone-pad"
                />

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Bank Account (optional)", "बैंक खाता (वैकल्पिक)")}
                </Text>
                <TextInput
                  style={{
                    marginTop: 6,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 11,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surfaceMuted,
                  }}
                  placeholder={x("Account number", "खाता नंबर")}
                  placeholderTextColor="#99A99A"
                  value={bankAccountNumber}
                  onChangeText={setBankAccountNumber}
                  keyboardType="number-pad"
                />

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("IFSC (optional)", "IFSC (वैकल्पिक)")}
                </Text>
                <TextInput
                  style={{
                    marginTop: 6,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 11,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surfaceMuted,
                  }}
                  placeholder={x("e.g., SBIN0001234", "जैसे SBIN0001234")}
                  placeholderTextColor="#99A99A"
                  value={ifscCode}
                  onChangeText={setIfscCode}
                  autoCapitalize="characters"
                />

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("UAN (optional)", "UAN (वैकल्पिक)")}
                </Text>
                <TextInput
                  style={{
                    marginTop: 6,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 11,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surfaceMuted,
                  }}
                  placeholder={x("12-digit UAN", "12 अंकों का UAN")}
                  placeholderTextColor="#99A99A"
                  value={uan}
                  onChangeText={setUan}
                  keyboardType="number-pad"
                />

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("ESIC IP Number (optional)", "ESIC IP नंबर (वैकल्पिक)")}
                </Text>
                <TextInput
                  style={{
                    marginTop: 6,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    padding: 11,
                    color: DairyColors.textPrimary,
                    backgroundColor: DairyColors.surfaceMuted,
                  }}
                  placeholder={x("10-digit ESIC IP number", "10 अंकों का ESIC IP नंबर")}
                  placeholderTextColor="#99A99A"
                  value={esicIpNumber}
                  onChangeText={setEsicIpNumber}
                  keyboardType="number-pad"
                />

                <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{x("Active", "सक्रिय")}</Text>
                  <Switch value={isActive} onValueChange={setIsActive} />
                </View>

                <Pressable
                  disabled={saving}
                  onPress={submitEmployee}
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: saving ? DairyColors.textSecondary : DairyColors.primary,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "800" }}>
                    {saving
                      ? x("Saving...", "सेव हो रहा है...")
                      : editingEmployeeId
                        ? x("Update Employee", "कर्मचारी अपडेट करें")
                        : x("Add Employee", "कर्मचारी जोड़ें")}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={resetForm}
                  style={{
                    marginTop: 8,
                    padding: 11,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    alignItems: "center",
                    backgroundColor: DairyColors.surface,
                  }}
                >
                  <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>{x("Cancel", "रद्द करें")}</Text>
                </Pressable>
              </View>
            ) : null}

            <Text style={{ marginTop: 14, marginBottom: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
              {x("Employee Directory", "कर्मचारी सूची")}
            </Text>
          </>
        }
        renderItem={({ item }) => {
          const tone = employeeTypeTone(item.type);
          return (
            <View
              style={{
                borderWidth: 1,
                borderColor: DairyColors.border,
                borderRadius: 14,
                backgroundColor: DairyColors.surface,
                padding: 12,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: DairyColors.textPrimary, fontSize: 16, fontWeight: "800" }}>{item.name}</Text>
                <View
                  style={{
                    borderRadius: 999,
                    backgroundColor: item.isActive ? DairyColors.successSoft : DairyColors.backgroundAlt,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                  }}
                >
                  <Text style={{ color: item.isActive ? DairyColors.success : DairyColors.textSecondary, fontWeight: "700" }}>
                    {item.isActive ? x("ACTIVE", "सक्रिय") : x("INACTIVE", "निष्क्रिय")}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  marginTop: 8,
                  alignSelf: "flex-start",
                  borderRadius: 999,
                  backgroundColor: tone.background,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
              >
                <Text style={{ color: tone.text, fontWeight: "700" }}>{label("employeeType", item.type)}</Text>
              </View>

              <Text style={{ marginTop: 8, color: DairyColors.textSecondary }}>
                {x("Role", "काम")}: {item.roleTitle || "-"}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x("Phone", "फोन")}: {item.phone || "-"}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x("Joined", "जॉइन")}: {item.joinDate || "-"}
              </Text>
              <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                {x("ID", "पहचान")}: {item.governmentIdType ? governmentIdTypeLabel(item.governmentIdType) : "-"} ({maskLast4(item.governmentIdNumber)})
              </Text>
              {item.emergencyContactName || item.emergencyContactPhone ? (
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x("Emergency", "आपातकालीन")}: {item.emergencyContactName || "-"} {item.emergencyContactPhone ? `(${item.emergencyContactPhone})` : ""}
                </Text>
              ) : null}
              {item.uan ? (
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x("UAN", "UAN")}: {maskLast4(item.uan)}
                </Text>
              ) : null}
              {item.esicIpNumber ? (
                <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                  {x("ESIC", "ESIC")}: {maskLast3(item.esicIpNumber)}
                </Text>
              ) : null}

              {canManageEmployees ? (
                <View style={{ marginTop: 10, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  <Pressable
                    onPress={() => startEdit(item)}
                    style={{
                      borderWidth: 1,
                      borderColor: DairyColors.border,
                      borderRadius: 10,
                      alignSelf: "flex-start",
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      backgroundColor: DairyColors.surfaceMuted,
                    }}
                  >
                    <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{x("Edit", "बदलें")}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => openSalaryForm(item)}
                    style={{
                      borderWidth: 1,
                      borderColor: DairyColors.warning,
                      borderRadius: 10,
                      alignSelf: "flex-start",
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      backgroundColor: DairyColors.warningSoft,
                    }}
                  >
                    <Text style={{ color: DairyColors.warning, fontWeight: "700" }}>{x("Pay Salary", "सैलरी दें")}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={{ marginTop: 20, color: DairyColors.textSecondary }}>
            {loading ? x("Loading employees...", "कर्मचारी लोड हो रहे हैं...") : x("No employees found.", "कोई कर्मचारी नहीं मिला।")}
          </Text>
        }
      />
    </View>
  );
}
