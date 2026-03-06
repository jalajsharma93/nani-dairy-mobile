import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Share, Switch, Text, TextInput, View } from "react-native";
import {
  AttendanceStatus,
  CompensationAdjustmentType,
  EmployeeApi,
  EmployeeAttendanceMonthlyReportResponse,
  EmployeeCompensationAdjustmentResponse,
  EmployeeGovernmentIdType,
  EmployeeResponse,
  EmployeeType,
  ExpenseApi,
  PaymentMode,
  SalaryComputationMode,
  Shift,
} from "../../services/api";
import { DairyColors } from "../../constants/dairy-theme";
import { useAuth } from "../../state/auth";
import { useI18n } from "../../state/i18n";
import { todayLocalISO } from "../../utils/date";
import { DateInput } from "../../../components/date-input";

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
const ATTENDANCE_SHIFTS: Shift[] = ["AM", "PM"];
const SALARY_MODES: SalaryComputationMode[] = [
  "NONE",
  "DAILY",
  "SHIFT",
  "HOURLY",
  "DAILY_PLUS_OVERTIME",
];
const COMP_ADJUSTMENT_TYPES: CompensationAdjustmentType[] = [
  "ADVANCE",
  "DEDUCTION",
  "BONUS",
  "PRODUCTION_INCENTIVE",
];

type AttendanceDraft = {
  status: AttendanceStatus;
  hoursWorked: string;
  notes: string;
  dirty: boolean;
};

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

function defaultAttendanceDraft(employee: EmployeeResponse): AttendanceDraft {
  return {
    status: "PRESENT",
    hoursWorked: employee.type === "PART_TIME" ? "4" : "8",
    notes: "",
    dirty: false,
  };
}

function normalizeHoursForAttendance(status: AttendanceStatus, value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 24) {
    throw new Error("Hours worked must be between 0 and 24.");
  }
  if (status === "PRESENT" && parsed <= 0) {
    throw new Error("Present attendance requires hours greater than 0.");
  }
  return parsed;
}

function monthEndIso(month: string): string {
  const trimmed = month.trim();
  const match = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return todayLocalISO();
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 1 || monthIndex > 12) {
    return todayLocalISO();
  }
  const lastDay = new Date(year, monthIndex, 0).getDate();
  return `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}`;
}

export default function EmployeesScreen() {
  const { hasAnyRole } = useAuth();
  const { x, label } = useI18n();
  const canManageEmployees = hasAnyRole("ADMIN");
  const canManageAttendance = hasAnyRole("ADMIN", "MANAGER");
  const canViewPayrollAdjustments = hasAnyRole("ADMIN", "MANAGER");
  const canManagePayrollAdjustments = hasAnyRole("ADMIN");

  const [employees, setEmployees] = useState<EmployeeResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceSavingAll, setAttendanceSavingAll] = useState(false);
  const [attendanceSavingEmployeeId, setAttendanceSavingEmployeeId] = useState<string | null>(null);
  const [attendanceDate, setAttendanceDate] = useState(todayLocalISO());
  const [attendanceShift, setAttendanceShift] = useState<Shift>("AM");
  const [attendanceByEmployeeId, setAttendanceByEmployeeId] = useState<Record<string, AttendanceDraft>>({});
  const [monthlyReportMonth, setMonthlyReportMonth] = useState(todayLocalISO().slice(0, 7));
  const [monthlyReport, setMonthlyReport] = useState<EmployeeAttendanceMonthlyReportResponse | null>(null);
  const [monthlyReportLoading, setMonthlyReportLoading] = useState(false);
  const [monthlyReportExporting, setMonthlyReportExporting] = useState(false);
  const [compAdjustments, setCompAdjustments] = useState<EmployeeCompensationAdjustmentResponse[]>([]);
  const [compAdjustmentsLoading, setCompAdjustmentsLoading] = useState(false);
  const [compAdjustmentSaving, setCompAdjustmentSaving] = useState(false);
  const [compAdjustmentEmployeeId, setCompAdjustmentEmployeeId] = useState<string>("");
  const [compAdjustmentDate, setCompAdjustmentDate] = useState(todayLocalISO());
  const [compAdjustmentType, setCompAdjustmentType] = useState<CompensationAdjustmentType>("ADVANCE");
  const [compAdjustmentAmount, setCompAdjustmentAmount] = useState("");
  const [compAdjustmentNotes, setCompAdjustmentNotes] = useState("");
  const [salaryMode, setSalaryMode] = useState<SalaryComputationMode>("DAILY");
  const [fullTimeDailyRate, setFullTimeDailyRate] = useState("900");
  const [partTimeDailyRate, setPartTimeDailyRate] = useState("550");
  const [fullTimeShiftRate, setFullTimeShiftRate] = useState("450");
  const [partTimeShiftRate, setPartTimeShiftRate] = useState("300");
  const [hourlyRate, setHourlyRate] = useState("90");
  const [overtimeHourlyRate, setOvertimeHourlyRate] = useState("120");
  const [standardHoursPerDay, setStandardHoursPerDay] = useState("8");
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
  const salaryModeLabel = (mode: SalaryComputationMode) => {
    if (mode === "NONE") return x("No salary calc", "कैल्कुलेशन नहीं");
    if (mode === "DAILY") return x("Daily", "दैनिक");
    if (mode === "SHIFT") return x("Shift", "शिफ्ट");
    if (mode === "HOURLY") return x("Hourly", "घंटे के हिसाब से");
    return x("Daily + OT", "दैनिक + ओटी");
  };
  const compAdjustmentTypeLabel = (type: CompensationAdjustmentType) => {
    if (type === "ADVANCE") return x("Advance", "अग्रिम");
    if (type === "DEDUCTION") return x("Deduction", "कटौती");
    if (type === "BONUS") return x("Bonus", "बोनस");
    return x("Production Incentive", "उत्पादन प्रोत्साहन");
  };

  const parseOptionalNonNegative = (value: string, fieldLabel: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`${fieldLabel} must be a non-negative number.`);
    }
    return parsed;
  };

  const activeEmployees = useMemo(() => employees.filter((employee) => employee.isActive), [employees]);

  const employeesById = useMemo(() => {
    const map = new Map<string, EmployeeResponse>();
    employees.forEach((employee) => map.set(employee.employeeId, employee));
    return map;
  }, [employees]);

  const attendanceDraftFor = useCallback(
    (employee: EmployeeResponse): AttendanceDraft => {
      return attendanceByEmployeeId[employee.employeeId] ?? defaultAttendanceDraft(employee);
    },
    [attendanceByEmployeeId]
  );

  const setAttendanceDraft = useCallback((employee: EmployeeResponse, patch: Partial<AttendanceDraft>) => {
    setAttendanceByEmployeeId((prev) => {
      const current = prev[employee.employeeId] ?? defaultAttendanceDraft(employee);
      return {
        ...prev,
        [employee.employeeId]: {
          ...current,
          ...patch,
          dirty: true,
        },
      };
    });
  }, []);

  const loadAttendance = useCallback(
    async (targetDate: string, targetShift: Shift) => {
      if (!canManageAttendance) {
        setAttendanceByEmployeeId({});
        return;
      }
      try {
        setAttendanceLoading(true);
        const rows = await EmployeeApi.listAttendance({
          date: targetDate,
          shift: targetShift,
        });
        const rowByEmployeeId = new Map(rows.map((row) => [row.employeeId, row]));
        const next: Record<string, AttendanceDraft> = {};
        activeEmployees.forEach((employee) => {
          const existing = rowByEmployeeId.get(employee.employeeId);
          if (!existing) {
            next[employee.employeeId] = defaultAttendanceDraft(employee);
            return;
          }
          next[employee.employeeId] = {
            status: existing.status,
            hoursWorked:
              existing.hoursWorked !== null && existing.hoursWorked !== undefined
                ? String(existing.hoursWorked)
                : existing.status === "ABSENT"
                  ? "0"
                  : defaultAttendanceDraft(employee).hoursWorked,
            notes: existing.notes ?? "",
            dirty: false,
          };
        });
        setAttendanceByEmployeeId(next);
      } catch (e: any) {
        console.error(e);
        Alert.alert(
          x("Load failed", "लोड नहीं हुआ"),
          e?.message ?? x("Could not load attendance records.", "उपस्थिति रिकॉर्ड लोड नहीं हो पाए।")
        );
      } finally {
        setAttendanceLoading(false);
      }
    },
    [activeEmployees, canManageAttendance, x]
  );

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

  useEffect(() => {
    if (!canManageAttendance) {
      setAttendanceByEmployeeId({});
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate.trim())) {
      return;
    }
    loadAttendance(attendanceDate, attendanceShift);
  }, [canManageAttendance, loadAttendance, activeEmployees, attendanceDate, attendanceShift]);

  useEffect(() => {
    if (activeEmployees.length === 0) {
      setCompAdjustmentEmployeeId("");
      return;
    }
    const exists = activeEmployees.some((employee) => employee.employeeId === compAdjustmentEmployeeId);
    if (!exists) {
      setCompAdjustmentEmployeeId(activeEmployees[0].employeeId);
    }
  }, [activeEmployees, compAdjustmentEmployeeId]);

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

  const saveAttendanceForEmployee = async (employee: EmployeeResponse) => {
    if (!canManageAttendance) {
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate.trim())) {
      Alert.alert(
        x("Invalid date", "गलत तारीख"),
        x("Attendance date must be in YYYY-MM-DD format.", "उपस्थिति तारीख YYYY-MM-DD में डालें।")
      );
      return;
    }
    const draft = attendanceDraftFor(employee);
    const normalizedNotes = normalizeOptionalInput(draft.notes);
    let normalizedHours: number;
    try {
      normalizedHours = normalizeHoursForAttendance(draft.status, draft.hoursWorked);
    } catch (error: any) {
      Alert.alert(x("Invalid hours", "घंटे गलत हैं"), x(error?.message ?? "Hours are invalid.", "घंटे गलत हैं।"));
      return;
    }

    try {
      setAttendanceSavingEmployeeId(employee.employeeId);
      const saved = await EmployeeApi.upsertAttendance({
        employeeId: employee.employeeId,
        attendanceDate: attendanceDate.trim(),
        shift: attendanceShift,
        status: draft.status,
        hoursWorked: normalizedHours,
        notes: normalizedNotes,
      });
      setAttendanceByEmployeeId((prev) => ({
        ...prev,
        [employee.employeeId]: {
          status: saved.status,
          hoursWorked:
            saved.hoursWorked !== null && saved.hoursWorked !== undefined
              ? String(saved.hoursWorked)
              : saved.status === "ABSENT"
                ? "0"
                : defaultAttendanceDraft(employee).hoursWorked,
          notes: saved.notes ?? "",
          dirty: false,
        },
      }));
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not save attendance.", "उपस्थिति सेव नहीं हो पाई।")
      );
    } finally {
      setAttendanceSavingEmployeeId(null);
    }
  };

  const saveAttendanceForAll = async () => {
    if (!canManageAttendance) {
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate.trim())) {
      Alert.alert(
        x("Invalid date", "गलत तारीख"),
        x("Attendance date must be in YYYY-MM-DD format.", "उपस्थिति तारीख YYYY-MM-DD में डालें।")
      );
      return;
    }
    if (!activeEmployees.length) {
      Alert.alert(
        x("No active employees", "कोई सक्रिय कर्मचारी नहीं"),
        x("Add active employees before marking attendance.", "उपस्थिति दर्ज करने से पहले सक्रिय कर्मचारी जोड़ें।")
      );
      return;
    }

    try {
      const entries = activeEmployees.map((employee) => {
        const draft = attendanceDraftFor(employee);
        const normalizedHours = normalizeHoursForAttendance(draft.status, draft.hoursWorked);
        return {
          employeeId: employee.employeeId,
          attendanceDate: attendanceDate.trim(),
          shift: attendanceShift,
          status: draft.status,
          hoursWorked: normalizedHours,
          notes: normalizeOptionalInput(draft.notes),
        };
      });

      setAttendanceSavingAll(true);
      const saved = await EmployeeApi.bulkUpsertAttendance({ entries });
      const savedByEmployeeId = new Map(saved.map((row) => [row.employeeId, row]));
      setAttendanceByEmployeeId((prev) => {
        const next: Record<string, AttendanceDraft> = { ...prev };
        activeEmployees.forEach((employee) => {
          const existing = savedByEmployeeId.get(employee.employeeId);
          if (!existing) {
            const previousDraft = prev[employee.employeeId] ?? defaultAttendanceDraft(employee);
            next[employee.employeeId] = {
              ...previousDraft,
              dirty: false,
            };
            return;
          }
          next[employee.employeeId] = {
            status: existing.status,
            hoursWorked:
              existing.hoursWorked !== null && existing.hoursWorked !== undefined
                ? String(existing.hoursWorked)
                : existing.status === "ABSENT"
                  ? "0"
                  : defaultAttendanceDraft(employee).hoursWorked,
            notes: existing.notes ?? "",
            dirty: false,
          };
        });
        return next;
      });
      Alert.alert(x("Attendance saved", "उपस्थिति सेव हो गई"), x("Saved for all active employees.", "सभी सक्रिय कर्मचारियों की उपस्थिति सेव हो गई।"));
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not save attendance for all employees.", "सभी कर्मचारियों की उपस्थिति सेव नहीं हो पाई।")
      );
    } finally {
      setAttendanceSavingAll(false);
    }
  };

  const buildMonthlyReportParams = () => {
    if (!/^\d{4}-\d{2}$/.test(monthlyReportMonth.trim())) {
      throw new Error("Month must be in YYYY-MM format.");
    }
    const standardHours = parseOptionalNonNegative(standardHoursPerDay, "Standard hours/day");
    if (standardHours != null && (standardHours <= 0 || standardHours > 24)) {
      throw new Error("Standard hours/day must be between 0 and 24.");
    }
    return {
      month: monthlyReportMonth.trim(),
      includeInactive: false,
      includeAdjustments: true,
      salaryMode,
      fullTimeDailyRate: parseOptionalNonNegative(fullTimeDailyRate, "Full-time daily rate"),
      partTimeDailyRate: parseOptionalNonNegative(partTimeDailyRate, "Part-time daily rate"),
      fullTimeShiftRate: parseOptionalNonNegative(fullTimeShiftRate, "Full-time shift rate"),
      partTimeShiftRate: parseOptionalNonNegative(partTimeShiftRate, "Part-time shift rate"),
      hourlyRate: parseOptionalNonNegative(hourlyRate, "Hourly rate"),
      overtimeHourlyRate: parseOptionalNonNegative(overtimeHourlyRate, "Overtime rate"),
      standardHoursPerDay: standardHours,
    };
  };

  const loadCompAdjustments = useCallback(
    async (month: string, employeeId?: string) => {
      if (!canViewPayrollAdjustments) {
        setCompAdjustments([]);
        return;
      }
      try {
        setCompAdjustmentsLoading(true);
        const rows = await EmployeeApi.listCompAdjustments({
          month,
          employeeId: employeeId?.trim() || undefined,
        });
        setCompAdjustments(rows);
      } catch (e: any) {
        console.error(e);
        Alert.alert(
          x("Load failed", "लोड नहीं हुआ"),
          e?.message ?? x("Could not load payroll adjustments.", "पेरोल समायोजन लोड नहीं हुए।")
        );
      } finally {
        setCompAdjustmentsLoading(false);
      }
    },
    [canViewPayrollAdjustments, x]
  );

  useEffect(() => {
    if (!canViewPayrollAdjustments) {
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(monthlyReportMonth.trim())) {
      return;
    }
    void loadCompAdjustments(monthlyReportMonth.trim(), compAdjustmentEmployeeId);
  }, [canViewPayrollAdjustments, monthlyReportMonth, compAdjustmentEmployeeId, loadCompAdjustments]);

  const saveCompAdjustment = async () => {
    if (!canManagePayrollAdjustments) {
      Alert.alert(
        x("Admin only", "सिर्फ एडमिन"),
        x("Only ADMIN can add payroll adjustments.", "पेरोल समायोजन जोड़ना सिर्फ ADMIN कर सकता है।")
      );
      return;
    }
    if (!compAdjustmentEmployeeId.trim()) {
      Alert.alert(x("Employee required", "कर्मचारी आवश्यक"), x("Select employee first.", "पहले कर्मचारी चुनें।"));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(compAdjustmentDate.trim())) {
      Alert.alert(
        x("Invalid date", "गलत तारीख"),
        x("Date must be in YYYY-MM-DD format.", "तारीख YYYY-MM-DD फॉर्मेट में होनी चाहिए।")
      );
      return;
    }
    const amount = Number(compAdjustmentAmount.trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert(
        x("Invalid amount", "गलत राशि"),
        x("Amount must be greater than 0.", "राशि 0 से ज्यादा होनी चाहिए।")
      );
      return;
    }
    try {
      setCompAdjustmentSaving(true);
      await EmployeeApi.createCompAdjustment({
        employeeId: compAdjustmentEmployeeId.trim(),
        adjustmentDate: compAdjustmentDate.trim(),
        adjustmentType: compAdjustmentType,
        amount,
        notes: normalizeOptionalInput(compAdjustmentNotes),
      });
      setCompAdjustmentAmount("");
      setCompAdjustmentNotes("");
      await Promise.all([
        loadCompAdjustments(monthlyReportMonth.trim(), compAdjustmentEmployeeId),
        loadMonthlyReport(),
      ]);
      Alert.alert(x("Saved", "सेव हुआ"), x("Payroll adjustment added.", "पेरोल समायोजन जोड़ दिया गया।"));
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Save failed", "सेव नहीं हुआ"),
        e?.message ?? x("Could not save payroll adjustment.", "पेरोल समायोजन सेव नहीं हुआ।")
      );
    } finally {
      setCompAdjustmentSaving(false);
    }
  };

  const deleteCompAdjustment = async (row: EmployeeCompensationAdjustmentResponse) => {
    if (!canManagePayrollAdjustments) {
      return;
    }
    try {
      await EmployeeApi.deleteCompAdjustment(row.adjustmentId);
      await Promise.all([
        loadCompAdjustments(monthlyReportMonth.trim(), compAdjustmentEmployeeId),
        loadMonthlyReport(),
      ]);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Delete failed", "हट नहीं पाया"),
        e?.message ?? x("Could not delete payroll adjustment.", "पेरोल समायोजन हट नहीं पाया।")
      );
    }
  };

  const loadMonthlyReport = async () => {
    if (!canManageAttendance) {
      return;
    }
    try {
      const params = buildMonthlyReportParams();
      setMonthlyReportLoading(true);
      const report = await EmployeeApi.monthlyAttendance(params);
      setMonthlyReport(report);
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Load failed", "लोड नहीं हुआ"),
        e?.message ?? x("Could not load monthly attendance report.", "मासिक उपस्थिति रिपोर्ट लोड नहीं हुई।")
      );
    } finally {
      setMonthlyReportLoading(false);
    }
  };

  const exportMonthlyReportCsv = async () => {
    if (!canManageAttendance) {
      return;
    }
    try {
      const params = buildMonthlyReportParams();
      setMonthlyReportExporting(true);
      const csv = await EmployeeApi.exportMonthlyAttendanceCsv(params);
      if (!csv.trim()) {
        Alert.alert(x("Empty export", "खाली एक्सपोर्ट"), x("No rows available for export.", "एक्सपोर्ट के लिए रिकॉर्ड नहीं हैं।"));
        return;
      }
      await Share.share({
        message: csv,
        title: `attendance-${params.month}.csv`,
      });
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        x("Export failed", "एक्सपोर्ट नहीं हुआ"),
        e?.message ?? x("Could not export monthly attendance CSV.", "मासिक उपस्थिति CSV एक्सपोर्ट नहीं हुआ।")
      );
    } finally {
      setMonthlyReportExporting(false);
    }
  };

  const applySuggestedSalaryFromReport = (
    row: EmployeeAttendanceMonthlyReportResponse["rows"][number]
  ) => {
    if (!canManageEmployees) {
      Alert.alert(
        x("Admin only", "सिर्फ एडमिन"),
        x("Only ADMIN users can record salary payments.", "सैलरी भुगतान रिकॉर्ड सिर्फ ADMIN कर सकता है।")
      );
      return;
    }
    const employee = employeesById.get(row.employeeId);
    if (!employee) {
      Alert.alert(
        x("Employee not found", "कर्मचारी नहीं मिला"),
        x("Reload employees and try again.", "कर्मचारी सूची रीलोड करके फिर से कोशिश करें।")
      );
      return;
    }
    setSalaryEmployee(employee);
    setSalaryDate(monthEndIso(monthlyReportMonth));
    setSalaryAmount(row.netPayableSalary.toFixed(2));
    setSalaryPaymentMode("UPI");
    setSalaryReferenceNo("");
    setSalaryNotes(
      `Attendance ${monthlyReportMonth} | ${salaryMode} | Gross ${row.grossSalary} | Net ${row.netPayableSalary}`
    );
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

            {canManageAttendance ? (
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
                  {x("Attendance", "उपस्थिति")}
                </Text>
                <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                  {x("Mark present/absent, shift and hours worked.", "हाजिरी, शिफ्ट और काम के घंटे दर्ज करें।")}
                </Text>

                <View style={{ marginTop: 10, flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <DateInput
                    placeholder={x("Attendance date (YYYY-MM-DD)", "उपस्थिति तारीख (YYYY-MM-DD)")}
                    value={attendanceDate}
                    onChangeText={setAttendanceDate}
                    />
                  </View>
                  <Pressable
                    onPress={() => loadAttendance(attendanceDate, attendanceShift)}
                    style={{
                      borderWidth: 1,
                      borderColor: DairyColors.border,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 11,
                      backgroundColor: DairyColors.surfaceMuted,
                    }}
                  >
                    <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                      {attendanceLoading ? x("Loading...", "लोड...") : x("Reload", "रीलोड")}
                    </Text>
                  </Pressable>
                </View>

                <View style={{ marginTop: 10, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {ATTENDANCE_SHIFTS.map((shiftOption) => {
                    const selected = attendanceShift === shiftOption;
                    return (
                      <Pressable
                        key={shiftOption}
                        onPress={() => setAttendanceShift(shiftOption)}
                        style={{
                          borderWidth: 1,
                          borderColor: selected ? DairyColors.primary : DairyColors.border,
                          backgroundColor: selected ? DairyColors.primarySoft : DairyColors.surface,
                          borderRadius: 999,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                        }}
                      >
                        <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{shiftOption}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Pressable
                  disabled={attendanceSavingAll}
                  onPress={saveAttendanceForAll}
                  style={{
                    marginTop: 10,
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: attendanceSavingAll ? DairyColors.textSecondary : DairyColors.primary,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "800" }}>
                    {attendanceSavingAll ? x("Saving...", "सेव हो रहा है...") : x("Save Attendance (All Active)", "उपस्थिति सेव करें (सभी सक्रिय)")}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {canManageAttendance ? (
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
                  {x("Monthly Attendance Report", "मासिक उपस्थिति रिपोर्ट")}
                </Text>
                <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                  {x(
                    "Per-employee totals with gross/net salary (attendance + adjustments).",
                    "हर कर्मचारी का सारांश, ग्रॉस/नेट सैलरी (उपस्थिति + समायोजन)।"
                  )}
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
                  placeholder={x("Month (YYYY-MM)", "महीना (YYYY-MM)")}
                  placeholderTextColor="#99A99A"
                  value={monthlyReportMonth}
                  onChangeText={setMonthlyReportMonth}
                />

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Salary Suggestion Mode", "सैलरी सुझाव मोड")}
                </Text>
                <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {SALARY_MODES.map((mode) => {
                    const selected = salaryMode === mode;
                    return (
                      <Pressable
                        key={mode}
                        onPress={() => setSalaryMode(mode)}
                        style={{
                          borderWidth: 1,
                          borderColor: selected ? DairyColors.primary : DairyColors.border,
                          backgroundColor: selected ? DairyColors.primarySoft : DairyColors.surface,
                          borderRadius: 999,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                        }}
                      >
                        <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{salaryModeLabel(mode)}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {(salaryMode === "DAILY" || salaryMode === "DAILY_PLUS_OVERTIME") ? (
                  <View style={{ marginTop: 10 }}>
                    <TextInput
                      style={{
                        borderWidth: 1,
                        borderColor: DairyColors.border,
                        borderRadius: 10,
                        padding: 11,
                        color: DairyColors.textPrimary,
                        backgroundColor: DairyColors.surfaceMuted,
                      }}
                      placeholder={x("Full-time daily rate", "फुल-टाइम दैनिक दर")}
                      placeholderTextColor="#99A99A"
                      keyboardType="decimal-pad"
                      value={fullTimeDailyRate}
                      onChangeText={setFullTimeDailyRate}
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
                      placeholder={x("Part-time daily rate", "पार्ट-टाइम दैनिक दर")}
                      placeholderTextColor="#99A99A"
                      keyboardType="decimal-pad"
                      value={partTimeDailyRate}
                      onChangeText={setPartTimeDailyRate}
                    />
                  </View>
                ) : null}

                {salaryMode === "SHIFT" ? (
                  <View style={{ marginTop: 10 }}>
                    <TextInput
                      style={{
                        borderWidth: 1,
                        borderColor: DairyColors.border,
                        borderRadius: 10,
                        padding: 11,
                        color: DairyColors.textPrimary,
                        backgroundColor: DairyColors.surfaceMuted,
                      }}
                      placeholder={x("Full-time shift rate", "फुल-टाइम शिफ्ट दर")}
                      placeholderTextColor="#99A99A"
                      keyboardType="decimal-pad"
                      value={fullTimeShiftRate}
                      onChangeText={setFullTimeShiftRate}
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
                      placeholder={x("Part-time shift rate", "पार्ट-टाइम शिफ्ट दर")}
                      placeholderTextColor="#99A99A"
                      keyboardType="decimal-pad"
                      value={partTimeShiftRate}
                      onChangeText={setPartTimeShiftRate}
                    />
                  </View>
                ) : null}

                {salaryMode === "HOURLY" ? (
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
                    placeholder={x("Hourly rate", "घंटे की दर")}
                    placeholderTextColor="#99A99A"
                    keyboardType="decimal-pad"
                    value={hourlyRate}
                    onChangeText={setHourlyRate}
                  />
                ) : null}

                {salaryMode === "DAILY_PLUS_OVERTIME" ? (
                  <View style={{ marginTop: 10 }}>
                    <TextInput
                      style={{
                        borderWidth: 1,
                        borderColor: DairyColors.border,
                        borderRadius: 10,
                        padding: 11,
                        color: DairyColors.textPrimary,
                        backgroundColor: DairyColors.surfaceMuted,
                      }}
                      placeholder={x("Overtime hourly rate", "ओवरटाइम घंटे की दर")}
                      placeholderTextColor="#99A99A"
                      keyboardType="decimal-pad"
                      value={overtimeHourlyRate}
                      onChangeText={setOvertimeHourlyRate}
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
                      placeholder={x("Standard hours/day", "स्टैंडर्ड घंटे/दिन")}
                      placeholderTextColor="#99A99A"
                      keyboardType="decimal-pad"
                      value={standardHoursPerDay}
                      onChangeText={setStandardHoursPerDay}
                    />
                  </View>
                ) : null}

                <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
                  <Pressable
                    disabled={monthlyReportLoading}
                    onPress={() => void loadMonthlyReport()}
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 10,
                      backgroundColor: monthlyReportLoading ? DairyColors.textSecondary : DairyColors.primary,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "800" }}>
                      {monthlyReportLoading ? x("Loading...", "लोड...") : x("Load Report", "रिपोर्ट लोड करें")}
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={monthlyReportExporting}
                    onPress={() => void exportMonthlyReportCsv()}
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 10,
                      backgroundColor: monthlyReportExporting ? DairyColors.textSecondary : DairyColors.info,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "800" }}>
                      {monthlyReportExporting ? x("Exporting...", "एक्सपोर्ट...") : x("Export CSV", "CSV एक्सपोर्ट")}
                    </Text>
                  </Pressable>
                </View>

                {monthlyReport ? (
                  <View style={{ marginTop: 12 }}>
                    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                      <View
                        style={{
                          flex: 1,
                          minWidth: 100,
                          backgroundColor: DairyColors.accentSoft,
                          borderRadius: 10,
                          padding: 10,
                        }}
                      >
                        <Text style={{ color: DairyColors.textSecondary }}>{x("Employees", "कर्मचारी")}</Text>
                        <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800" }}>
                          {monthlyReport.totalEmployees}
                        </Text>
                      </View>
                      <View
                        style={{
                          flex: 1,
                          minWidth: 100,
                          backgroundColor: DairyColors.successSoft,
                          borderRadius: 10,
                          padding: 10,
                        }}
                      >
                        <Text style={{ color: DairyColors.textSecondary }}>{x("Present Days", "उपस्थित दिन")}</Text>
                        <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800" }}>
                          {monthlyReport.totalPresentDays}
                        </Text>
                      </View>
                      <View
                        style={{
                          flex: 1,
                          minWidth: 120,
                          backgroundColor: DairyColors.warningSoft,
                          borderRadius: 10,
                          padding: 10,
                        }}
                      >
                        <Text style={{ color: DairyColors.textSecondary }}>{x("Suggested Salary", "सुझाव सैलरी")}</Text>
                        <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800" }}>
                          {`Rs ${monthlyReport.totalSuggestedSalary.toFixed(2)}`}
                        </Text>
                      </View>
                      <View
                        style={{
                          flex: 1,
                          minWidth: 120,
                          backgroundColor: DairyColors.infoSoft,
                          borderRadius: 10,
                          padding: 10,
                        }}
                      >
                        <Text style={{ color: DairyColors.textSecondary }}>{x("Gross Salary", "ग्रॉस सैलरी")}</Text>
                        <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800" }}>
                          {`Rs ${monthlyReport.totalGrossSalary.toFixed(2)}`}
                        </Text>
                      </View>
                      <View
                        style={{
                          flex: 1,
                          minWidth: 120,
                          backgroundColor: DairyColors.successSoft,
                          borderRadius: 10,
                          padding: 10,
                        }}
                      >
                        <Text style={{ color: DairyColors.textSecondary }}>{x("Net Payable", "नेट देय")}</Text>
                        <Text style={{ marginTop: 4, color: DairyColors.textPrimary, fontWeight: "800" }}>
                          {`Rs ${monthlyReport.totalNetPayableSalary.toFixed(2)}`}
                        </Text>
                      </View>
                    </View>

                    {monthlyReport.rows.length === 0 ? (
                      <Text style={{ marginTop: 10, color: DairyColors.textSecondary }}>
                        {x("No attendance rows for selected month.", "चुने हुए महीने के लिए रिकॉर्ड नहीं मिले।")}
                      </Text>
                    ) : (
                      monthlyReport.rows.map((row) => (
                        <View
                          key={`monthly-${row.employeeId}`}
                          style={{
                            marginTop: 10,
                            borderWidth: 1,
                            borderColor: DairyColors.border,
                            borderRadius: 10,
                            padding: 10,
                            backgroundColor: DairyColors.surfaceMuted,
                          }}
                        >
                          <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                            {row.employeeName || row.employeeId}
                          </Text>
                          <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                            {`${x("Present", "उपस्थित")}: ${row.presentDays} | ${x("Absent", "अनुपस्थित")}: ${row.absentDays}`}
                          </Text>
                          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                            {`${x("Shifts", "शिफ्ट")}: ${row.presentShifts}/${row.shiftsMarked} | ${x("Hours", "घंटे")}: ${row.totalHoursWorked.toFixed(2)}`}
                          </Text>
                          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                            {`${x("Suggested", "सुझाव")}: Rs ${row.suggestedSalary.toFixed(2)}`}
                          </Text>
                          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                            {`${x("Adj", "समायोजन")} | ${x("Bonus", "बोनस")}: Rs ${row.bonusAmount.toFixed(2)} | ${x("Incentive", "प्रोत्साहन")}: Rs ${row.productionIncentiveAmount.toFixed(2)}`}
                          </Text>
                          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>
                            {`${x("Advance", "अग्रिम")}: Rs ${row.advanceAmount.toFixed(2)} | ${x("Deduction", "कटौती")}: Rs ${row.deductionAmount.toFixed(2)}`}
                          </Text>
                          <Text style={{ marginTop: 2, color: DairyColors.textPrimary, fontWeight: "700" }}>
                            {`${x("Gross", "ग्रॉस")}: Rs ${row.grossSalary.toFixed(2)} | ${x("Net", "नेट")}: Rs ${row.netPayableSalary.toFixed(2)}`}
                          </Text>

                          {canManageEmployees ? (
                            <Pressable
                              onPress={() => applySuggestedSalaryFromReport(row)}
                              style={{
                                marginTop: 8,
                                borderWidth: 1,
                                borderColor: DairyColors.primary,
                                borderRadius: 8,
                                alignSelf: "flex-start",
                                paddingHorizontal: 10,
                                paddingVertical: 7,
                                backgroundColor: DairyColors.primarySoft,
                              }}
                            >
                              <Text style={{ color: DairyColors.primary, fontWeight: "700" }}>
                                {x("Use Net Payable", "नेट देय भरें")}
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ))
                    )}
                  </View>
                ) : null}
              </View>
            ) : null}

            {canViewPayrollAdjustments ? (
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
                  {x("Payroll Adjustments", "पेरोल समायोजन")}
                </Text>
                <Text style={{ marginTop: 4, color: DairyColors.textSecondary }}>
                  {x(
                    "Track advances, deductions, bonuses and production incentives month-wise.",
                    "महीने के हिसाब से अग्रिम, कटौती, बोनस और उत्पादन प्रोत्साहन ट्रैक करें।"
                  )}
                </Text>

                <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ marginBottom: 6, color: DairyColors.textSecondary, fontWeight: "700" }}>
                      {x("Month", "महीना")}
                    </Text>
                    <TextInput
                      style={{
                        borderWidth: 1,
                        borderColor: DairyColors.border,
                        borderRadius: 10,
                        padding: 11,
                        color: DairyColors.textPrimary,
                        backgroundColor: DairyColors.surfaceMuted,
                      }}
                      placeholder={x("YYYY-MM", "YYYY-MM")}
                      placeholderTextColor="#99A99A"
                      value={monthlyReportMonth}
                      onChangeText={setMonthlyReportMonth}
                    />
                  </View>
                  <Pressable
                    onPress={() => {
                      if (!/^\d{4}-\d{2}$/.test(monthlyReportMonth.trim())) {
                        Alert.alert(
                          x("Invalid month", "गलत महीना"),
                          x("Month must be in YYYY-MM format.", "महीना YYYY-MM फॉर्मेट में हो।")
                        );
                        return;
                      }
                      void loadCompAdjustments(monthlyReportMonth.trim(), compAdjustmentEmployeeId);
                    }}
                    style={{
                      alignSelf: "flex-end",
                      borderWidth: 1,
                      borderColor: DairyColors.border,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 11,
                      backgroundColor: DairyColors.surfaceMuted,
                    }}
                  >
                    <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                      {compAdjustmentsLoading ? x("Loading...", "लोड...") : x("Reload", "रीलोड")}
                    </Text>
                  </Pressable>
                </View>

                <Text style={{ marginTop: 10, color: DairyColors.textSecondary, fontWeight: "700" }}>
                  {x("Employee", "कर्मचारी")}
                </Text>
                <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {activeEmployees.map((employee) => {
                    const selected = compAdjustmentEmployeeId === employee.employeeId;
                    return (
                      <Pressable
                        key={`comp-emp-${employee.employeeId}`}
                        onPress={() => setCompAdjustmentEmployeeId(employee.employeeId)}
                        style={{
                          borderWidth: 1,
                          borderColor: selected ? DairyColors.primary : DairyColors.border,
                          borderRadius: 999,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          backgroundColor: selected ? DairyColors.primarySoft : DairyColors.surface,
                        }}
                      >
                        <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                          {employee.name || employee.employeeId}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {canManagePayrollAdjustments ? (
                  <View style={{ marginTop: 12 }}>
                    <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
                      {x("Type", "प्रकार")}
                    </Text>
                    <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {COMP_ADJUSTMENT_TYPES.map((type) => {
                        const selected = compAdjustmentType === type;
                        return (
                          <Pressable
                            key={`adj-type-${type}`}
                            onPress={() => setCompAdjustmentType(type)}
                            style={{
                              borderWidth: 1,
                              borderColor: selected ? DairyColors.primary : DairyColors.border,
                              borderRadius: 999,
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                              backgroundColor: selected ? DairyColors.primarySoft : DairyColors.surface,
                            }}
                          >
                            <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>
                              {compAdjustmentTypeLabel(type)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <DateInput
                      placeholder={x("Adjustment date (YYYY-MM-DD)", "समायोजन तारीख (YYYY-MM-DD)")}
                      value={compAdjustmentDate}
                      onChangeText={setCompAdjustmentDate}
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
                      placeholder={x("Amount", "राशि")}
                      placeholderTextColor="#99A99A"
                      keyboardType="decimal-pad"
                      value={compAdjustmentAmount}
                      onChangeText={setCompAdjustmentAmount}
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
                      value={compAdjustmentNotes}
                      onChangeText={setCompAdjustmentNotes}
                    />
                    <Pressable
                      disabled={compAdjustmentSaving}
                      onPress={() => void saveCompAdjustment()}
                      style={{
                        marginTop: 8,
                        borderRadius: 10,
                        padding: 12,
                        backgroundColor: compAdjustmentSaving ? DairyColors.textSecondary : DairyColors.primary,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: "white", fontWeight: "800" }}>
                        {compAdjustmentSaving ? x("Saving...", "सेव...") : x("Add Adjustment", "समायोजन जोड़ें")}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                <View style={{ marginTop: 12 }}>
                  {compAdjustments.length === 0 ? (
                    <Text style={{ color: DairyColors.textSecondary }}>
                      {compAdjustmentsLoading
                        ? x("Loading adjustments...", "समायोजन लोड हो रहे हैं...")
                        : x("No adjustments found for selected filter.", "चुने फ़िल्टर के लिए कोई समायोजन नहीं मिला।")}
                    </Text>
                  ) : (
                    compAdjustments.map((row) => (
                      <View
                        key={row.adjustmentId}
                        style={{
                          marginTop: 8,
                          borderWidth: 1,
                          borderColor: DairyColors.border,
                          borderRadius: 10,
                          padding: 10,
                          backgroundColor: DairyColors.surfaceMuted,
                        }}
                      >
                        <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>
                          {(row.employeeName || row.employeeId) + " | " + compAdjustmentTypeLabel(row.adjustmentType)}
                        </Text>
                        <Text style={{ marginTop: 3, color: DairyColors.textSecondary }}>
                          {`${row.adjustmentDate} | Rs ${row.amount.toFixed(2)}`}
                        </Text>
                        {row.notes ? (
                          <Text style={{ marginTop: 2, color: DairyColors.textSecondary }}>{row.notes}</Text>
                        ) : null}
                        {canManagePayrollAdjustments ? (
                          <Pressable
                            onPress={() => void deleteCompAdjustment(row)}
                            style={{
                              marginTop: 8,
                              borderWidth: 1,
                              borderColor: DairyColors.danger,
                              borderRadius: 8,
                              alignSelf: "flex-start",
                              paddingHorizontal: 10,
                              paddingVertical: 7,
                              backgroundColor: "#FDECEC",
                            }}
                          >
                            <Text style={{ color: DairyColors.danger, fontWeight: "700" }}>
                              {x("Delete", "हटाएं")}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ))
                  )}
                </View>
              </View>
            ) : null}

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

                <DateInput
                  placeholder={x("Payment date (YYYY-MM-DD)", "भुगतान तारीख (YYYY-MM-DD)")}
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
                <DateInput
                  placeholder={x("YYYY-MM-DD", "YYYY-MM-DD")}
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
          const attendanceDraft = attendanceDraftFor(item);
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

              {canManageAttendance && item.isActive ? (
                <View
                  style={{
                    marginTop: 10,
                    borderWidth: 1,
                    borderColor: DairyColors.border,
                    borderRadius: 10,
                    backgroundColor: DairyColors.surfaceMuted,
                    padding: 10,
                  }}
                >
                  <Text style={{ color: DairyColors.textSecondary, fontWeight: "700" }}>
                    {x("Attendance", "उपस्थिति")} ({attendanceDate} / {attendanceShift})
                  </Text>

                  <View style={{ marginTop: 8, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    {(["PRESENT", "ABSENT"] as AttendanceStatus[]).map((statusOption) => {
                      const selected = attendanceDraft.status === statusOption;
                      return (
                        <Pressable
                          key={statusOption}
                          onPress={() =>
                            setAttendanceDraft(item, {
                              status: statusOption,
                              hoursWorked:
                                statusOption === "ABSENT" ? "0" : attendanceDraft.hoursWorked || defaultAttendanceDraft(item).hoursWorked,
                            })
                          }
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
                            {statusOption === "PRESENT" ? x("Present", "उपस्थित") : x("Absent", "अनुपस्थित")}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <TextInput
                    style={{
                      marginTop: 8,
                      borderWidth: 1,
                      borderColor: DairyColors.border,
                      borderRadius: 10,
                      padding: 10,
                      color: DairyColors.textPrimary,
                      backgroundColor: DairyColors.surface,
                    }}
                    placeholder={x("Hours worked", "काम के घंटे")}
                    placeholderTextColor="#99A99A"
                    keyboardType="decimal-pad"
                    value={attendanceDraft.hoursWorked}
                    onChangeText={(value) => setAttendanceDraft(item, { hoursWorked: value })}
                  />

                  <TextInput
                    style={{
                      marginTop: 8,
                      borderWidth: 1,
                      borderColor: DairyColors.border,
                      borderRadius: 10,
                      padding: 10,
                      color: DairyColors.textPrimary,
                      backgroundColor: DairyColors.surface,
                    }}
                    placeholder={x("Notes (optional)", "नोट्स (वैकल्पिक)")}
                    placeholderTextColor="#99A99A"
                    value={attendanceDraft.notes}
                    onChangeText={(value) => setAttendanceDraft(item, { notes: value })}
                  />

                  <Pressable
                    disabled={attendanceSavingEmployeeId === item.employeeId}
                    onPress={() => saveAttendanceForEmployee(item)}
                    style={{
                      marginTop: 8,
                      borderWidth: 1,
                      borderColor: DairyColors.primary,
                      borderRadius: 10,
                      alignItems: "center",
                      paddingVertical: 9,
                      backgroundColor:
                        attendanceSavingEmployeeId === item.employeeId ? DairyColors.backgroundAlt : DairyColors.primarySoft,
                    }}
                  >
                    <Text style={{ color: DairyColors.primary, fontWeight: "700" }}>
                      {attendanceSavingEmployeeId === item.employeeId
                        ? x("Saving...", "सेव हो रहा है...")
                        : x("Save Attendance", "उपस्थिति सेव करें")}
                    </Text>
                  </Pressable>
                </View>
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
